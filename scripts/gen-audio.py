#!/usr/bin/env python3
"""gen-audio.py — render narration scripts to speech with an ElevenLabs cloned voice.

Reads the reviewed narration scripts in  data/narration/{id}-{slug}.txt  and calls the
ElevenLabs text-to-speech API (Rob's cloned voice) to produce  audio/{id}.mp3  for each.
Those MP3s then get uploaded to R2 (cdn.muralquest.app/audio/) and each mural's `audio:`
YAML field is pointed at its URL → `aud` in data.js/content.json → the detail-page
speaker button plays it. Ships OTA (no app build). See docs/NARRATION.md.

KEY HANDLING (never commit the key):
  Reads the ElevenLabs API key from, in order:
    1. env var  ELEVENLABS_API_KEY
    2. a gitignored  .mq-elevenlabs-key  file at the repo root (one line: the key)
  Set it up once (in your own shell / on disk — do NOT paste the key into chat):
    export ELEVENLABS_API_KEY=...            (per-shell)
  or
    printf '...' > .mq-elevenlabs-key         (stays local; .gitignored)

USAGE:
  python3 scripts/gen-audio.py --route downtown-north
  python3 scripts/gen-audio.py --ids 6,1,23
  python3 scripts/gen-audio.py --all
  python3 scripts/gen-audio.py --ids 6 --force        # re-render existing mp3s
  python3 scripts/gen-audio.py --ids 6 --voice <id>   # override the voice

Output: audio/{id}.mp3  (gitignored — regenerable; hosted on the CDN).
No extra pip installs — uses the Python standard library.
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NARRATION_DIR = ROOT / "data" / "narration"
APP_JS = ROOT / "js" / "app.js"
OUT_DIR = ROOT / "audio"
KEY_FILE = ROOT / ".mq-elevenlabs-key"

# Rob's cloned voice + the settings tuned during cloning (from HANDOFF: Stability 35,
# Similarity 80, Style 25, Speaker boost on, Speed 1.1, Multilingual v2).
DEFAULT_VOICE_ID = "j4oeEFBclPuKY5zSUU3p"
MODEL_ID = "eleven_multilingual_v2"
OUTPUT_FORMAT = "mp3_44100_64"  # 64 kbps mono — ample for a single spoken voice, ~half the size
VOICE_SETTINGS = {
    "stability": 0.35,
    "similarity_boost": 0.80,
    "style": 0.25,
    "use_speaker_boost": True,
    "speed": 1.1,
}

API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=" + OUTPUT_FORMAT


def load_key():
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if key:
        return key
    if KEY_FILE.exists():
        key = KEY_FILE.read_text(encoding="utf-8").strip()
        if key:
            return key
    sys.exit(
        "No ElevenLabs API key found.\n"
        "  Set it in your shell:   export ELEVENLABS_API_KEY=...\n"
        f"  or write it to a local (gitignored) file:\n"
        f"      printf '...' > {KEY_FILE.relative_to(ROOT)}\n"
        "The key is never committed (.mq-elevenlabs-key is in .gitignore)."
    )


def route_ids(route_id):
    """Pull a route's ordered id list out of ROUTE_DEFS in js/app.js."""
    src = APP_JS.read_text(encoding="utf-8")
    m = re.search(
        r"id:\s*'" + re.escape(route_id) + r"'.*?ids:\s*\[([0-9,\s]+)\]",
        src, re.DOTALL,
    )
    if not m:
        sys.exit(f"Route '{route_id}' not found in {APP_JS.relative_to(ROOT)} ROUTE_DEFS.")
    return [s.strip() for s in m.group(1).split(",") if s.strip()]


def script_for(mid):
    """Find data/narration/{id}-*.txt for a mural id. Returns Path or None."""
    matches = sorted(NARRATION_DIR.glob(f"{mid}-*.txt"))
    return matches[0] if matches else None


def all_script_ids():
    ids = []
    for p in sorted(NARRATION_DIR.glob("*.txt")):
        m = re.match(r"(\d+)-", p.name)
        if m:
            ids.append(m.group(1))
    return ids


def synthesize(key, voice, text):
    body = json.dumps({
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": VOICE_SETTINGS,
    }).encode("utf-8")
    req = urllib.request.Request(
        API_URL.format(voice=voice),
        data=body,
        headers={
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def main():
    ap = argparse.ArgumentParser(description="Render narration scripts to speech via ElevenLabs.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--route", help="route id from ROUTE_DEFS, e.g. downtown-north")
    g.add_argument("--ids", help="comma-separated mural ids, e.g. 6,1,23")
    g.add_argument("--all", action="store_true", help="every mural with a narration script")
    ap.add_argument("--voice", default=DEFAULT_VOICE_ID, help="ElevenLabs voice id")
    ap.add_argument("--force", action="store_true", help="overwrite existing mp3s")
    ap.add_argument("--limit", type=int, help="stop after N (testing)")
    args = ap.parse_args()

    if args.route:
        ids = route_ids(args.route)
    elif args.ids:
        ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    else:
        ids = all_script_ids()
    if args.limit:
        ids = ids[: args.limit]
    if not ids:
        sys.exit("No matching narration scripts.")

    key = load_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    ok = 0
    for idx, mid in enumerate(ids, 1):
        script = script_for(mid)
        tag = f"[{idx}/{len(ids)}] #{mid}"
        if not script:
            print(f"{tag}  — no script (data/narration/{mid}-*.txt), skipped", file=sys.stderr)
            continue
        out = OUT_DIR / f"{mid}.mp3"
        if out.exists() and not args.force:
            print(f"{tag}  — skip (exists; --force to redo)")
            continue
        text = script.read_text(encoding="utf-8").strip()
        if not text:
            print(f"{tag}  — empty script, skipped", file=sys.stderr)
            continue
        try:
            audio = synthesize(key, args.voice, text)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            print(f"{tag}  — HTTP {e.code}: {detail}", file=sys.stderr)
            if e.code in (401, 403):
                sys.exit("Auth failed — check the ElevenLabs API key.")
            continue
        except Exception as e:
            print(f"{tag}  — ERROR: {e}", file=sys.stderr)
            continue
        out.write_bytes(audio)
        kb = len(audio) // 1024
        print(f"{tag}  → {out.relative_to(ROOT)}  ({kb} KB)  from {script.name}")
        ok += 1

    print(f"\n{ok} clip(s) written to {OUT_DIR.relative_to(ROOT)}/. "
          "Listen, then we host them on R2 + set each mural's audio: field.")


if __name__ == "__main__":
    main()
