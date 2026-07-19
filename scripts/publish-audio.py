#!/usr/bin/env python3
"""publish-audio.py — upload narration MP3s to R2 (cdn.muralquest.app/audio/).

The clips produced by scripts/gen-audio.py (audio/{id}.mp3) are hosted on the same
Cloudflare R2 bucket as the images and served at cdn.muralquest.app. Each mural's
`audio:` YAML field points at its URL:

  audio/6.mp3  →  https://cdn.muralquest.app/audio/6.mp3

Uses wrangler (OAuth — no S3 keys). Idempotent: re-uploading overwrites in place.
Run  npx wrangler whoami  first if unsure you're authenticated.

USAGE:
  python3 scripts/publish-audio.py            # upload every audio/*.mp3
  python3 scripts/publish-audio.py --ids 6,1  # just these mural ids
  python3 scripts/publish-audio.py --dry-run  # list what would upload
"""

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
BUCKET = "muralquest-content"
# 1-day cache: long enough to be fast + cache offline for tours, short enough that a
# re-rendered clip (same filename) propagates within a day without manual purge.
CACHE_CONTROL = "public, max-age=86400"


def upload(mp3: Path):
    key = f"audio/{mp3.name}"
    subprocess.run(
        ["npx", "wrangler", "r2", "object", "put", f"{BUCKET}/{key}",
         "--file", str(mp3), "--content-type", "audio/mpeg",
         "--cache-control", CACHE_CONTROL, "--remote"],
        check=True, capture_output=True, text=True,
    )
    return key


def main():
    ap = argparse.ArgumentParser(description="Upload narration MP3s to R2.")
    ap.add_argument("--ids", help="comma-separated mural ids (default: all in audio/)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not AUDIO_DIR.exists():
        sys.exit("No audio/ directory — run scripts/gen-audio.py first.")

    files = sorted(AUDIO_DIR.glob("*.mp3"))
    if args.ids:
        want = {s.strip() for s in args.ids.split(",") if s.strip()}
        files = [f for f in files if f.stem in want]
    if not files:
        sys.exit("No matching mp3s in audio/.")

    total_mb = sum(f.stat().st_size for f in files) / 1e6
    print(f"{len(files)} clips, {total_mb:.1f} MB → {BUCKET}/audio/ (cdn.muralquest.app/audio/)")
    if args.dry_run:
        for f in files:
            print(f"  would upload  audio/{f.name}  →  https://cdn.muralquest.app/audio/{f.name}")
        return

    done, failed = 0, []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(upload, f): f for f in files}
        for fut in as_completed(futs):
            f = futs[fut]
            try:
                fut.result()
                done += 1
                print(f"  ✓ audio/{f.name}")
            except subprocess.CalledProcessError as e:
                failed.append(f.name)
                print(f"  ✗ audio/{f.name}: {e.stderr.strip().splitlines()[-1] if e.stderr else e}",
                      file=sys.stderr)

    print(f"\n✓ Uploaded {done}/{len(files)} clips to {BUCKET}/audio/.")
    if failed:
        sys.exit(f"Failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
