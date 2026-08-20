#!/usr/bin/env python3
"""mq_play_upload.py — upload an AAB to Google Play and roll out, via the
Play Developer API + the play-publisher service account (like mq_build.sh does
for Apple). No Play Console clicking.

Auth: service-account JSON key at repo-root .mq-play-key.json (gitignored).
The service account (play-publisher@mural-quest.iam.gserviceaccount.com) must be
invited under Play Console → Users and permissions with release rights.

Usage:
  python3 assets/wip/mq_play_upload.py --aab <path> [--track production]
      [--notes "What's new"] [--status completed|draft] [--rollout 1.0]

Defaults: newest app-release-v*.aab in ~/Desktop/mural-quest-play-assets,
track=production, status=completed (full rollout).
"""
import argparse, glob, os, sys
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KEY = os.path.join(ROOT, ".mq-play-key.json")
PACKAGE = "com.muralquest.stpete"
ASSETS = os.path.expanduser("~/Desktop/mural-quest-play-assets")
SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def newest_aab():
    files = sorted(glob.glob(os.path.join(ASSETS, "app-release-v*.aab")),
                   key=lambda f: int(''.join(c for c in os.path.basename(f) if c.isdigit()) or 0))
    return files[-1] if files else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aab", default=None)
    ap.add_argument("--track", default="production")
    ap.add_argument("--notes", default="Fixes and refinements.")
    ap.add_argument("--status", default="completed", choices=["completed", "draft", "inProgress", "halted"])
    ap.add_argument("--rollout", type=float, default=1.0, help="user fraction for inProgress")
    ap.add_argument("--lang", default="en-US")
    args = ap.parse_args()

    aab = args.aab or newest_aab()
    if not aab or not os.path.exists(aab):
        sys.exit(f"No AAB found (looked in {ASSETS}). Pass --aab <path>.")
    if not os.path.exists(KEY):
        sys.exit(f"Missing service-account key at {KEY}.")

    creds = service_account.Credentials.from_service_account_file(KEY, scopes=[SCOPE])
    svc = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = svc.edits()

    print(f"→ Uploading {os.path.basename(aab)} to {PACKAGE} (track: {args.track}, status: {args.status})")
    try:
        edit_id = edits.insert(packageName=PACKAGE, body={}).execute()["id"]

        media = MediaFileUpload(aab, mimetype="application/octet-stream", resumable=True)
        req = edits.bundles().upload(packageName=PACKAGE, editId=edit_id, media_body=media)
        resp = None
        while resp is None:
            status, resp = req.next_chunk()
            if status:
                print(f"  uploading… {int(status.progress() * 100)}%")
        version_code = resp["versionCode"]
        print(f"  ✓ uploaded — versionCode {version_code}")

        release = {
            "status": args.status,
            "versionCodes": [str(version_code)],
            "releaseNotes": [{"language": args.lang, "text": args.notes}],
        }
        if args.status == "inProgress":
            release["userFraction"] = args.rollout
        edits.tracks().update(packageName=PACKAGE, editId=edit_id, track=args.track,
                              body={"track": args.track, "releases": [release]}).execute()
        print(f"  ✓ assigned to {args.track}")

        edits.commit(packageName=PACKAGE, editId=edit_id).execute()
        print(f"✓ DONE — v{version_code} committed to {args.track} ({args.status}). "
              f"Google review can take a few hours to ~2 days.")
    except HttpError as e:
        sys.exit(f"Play API error: {e}")


if __name__ == "__main__":
    main()
