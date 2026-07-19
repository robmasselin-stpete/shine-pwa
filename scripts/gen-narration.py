#!/usr/bin/env python3
"""gen-narration.py — draft ElevenLabs narration scripts per mural via the Claude API.

Mural Quest's narrated walking tours (v1.5) play a short spoken script as you reach
each mural. This drafts those scripts from existing mural data (inspiration + bio +
description) in Mural Quest's voice, tuned for the ear rather than the eye, and writes
each one to  data/narration/<id>-<slug>.txt  for review.

Nothing is applied to the YAMLs automatically — review, tweak, then paste the final
text into the mural's `audio:` field and run  python3 scripts/build-data.py  (that
field flows to `aud` in js/data.js and js/content.json). See docs/NARRATION.md.

KEY HANDLING (never commit the key):
  Reads the Anthropic API key from, in order:
    1. env var  ANTHROPIC_API_KEY
    2. a gitignored  .mq-anthropic-key  file at the repo root (one line: the key)
  To set it up once, either
    export ANTHROPIC_API_KEY=sk-ant-...          (in your own shell)
  or
    printf 'sk-ant-...' > .mq-anthropic-key       (stays local; .gitignored)

USAGE:
  python3 scripts/gen-narration.py --route downtown-north
  python3 scripts/gen-narration.py --ids 6,1,23
  python3 scripts/gen-narration.py --all
  python3 scripts/gen-narration.py --route downtown-north --force   # redo existing drafts
  python3 scripts/gen-narration.py --ids 6 --print                  # print, don't write

Requires the Anthropic SDK:  pip3 install anthropic
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_JSON = ROOT / "js" / "content.json"
APP_JS = ROOT / "js" / "app.js"
STYLE_CARD = ROOT / "data" / "mural-quest-bio-style-card.md"
OUT_DIR = ROOT / "data" / "narration"
KEY_FILE = ROOT / ".mq-anthropic-key"

MODEL = "claude-opus-4-8"

SYSTEM_PROMPT = """\
You write short narration scripts for Mural Quest, a street-art walking-tour app for \
St. Petersburg, Florida. The listener is standing in front of a mural, phone in pocket \
or in hand, hearing your words read aloud in the founder's own voice. This is audio, \
not text on a screen — it will be read by a real person and heard, never seen.

VOICE (same as the app's written bios — keep it):
- Lead with the single most interesting true thing. Never open with "This mural is by \
[name], a [city]-based artist." That's a skip.
- Facts only, drawn from the source material provided. No speculation, no "perhaps," no \
"likely," no invented motivations. If the material is thin, write shorter.
- Active voice, present tense where natural. The artist is alive and working.
- Dry wit is allowed, one knowing observation at most. Whimsy is not. Never use \
exclamation points. Never say "incredible," "amazing," or "stunning."
- One or two credentials that land hardest, not a resume.

AUDIO RULES (this is what makes it a script, not a bio):
- Target 100 to 150 words. Roughly forty-five to seventy seconds spoken. Shorter is \
fine when the material is thin; never pad.
- Write for the ear. Short, clean sentences that are easy to say out loud. Read it back \
in your head — if you'd stumble, rewrite it.
- Spell numbers and years as words ("twenty twenty-five," not "2025"; "the six hundred \
block," not "the 600 block") so the reader never has to convert on the fly.
- No URLs, no @handles, no hashtags, no email addresses. Strip them.
- Address the listener directly when it helps ("Look up and to the left..."), and end \
by pulling their eye to one specific, real detail of the work in front of them — only \
if the source material actually supports that detail. Don't invent what's on the wall.
- Do not read the address or GPS. The app already put them there.

STRUCTURE (loose, not a template): orient them to what they're looking at, give the \
hook or the inspiration, one beat about the artist, then land on a detail to notice.

Return ONLY the finished script text — the words to be read aloud, nothing else. No \
title, no word count, no notes, no quotation marks around it.\
"""


def load_key():
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    if KEY_FILE.exists():
        key = KEY_FILE.read_text(encoding="utf-8").strip()
        if key:
            return key
    sys.exit(
        "No Anthropic API key found.\n"
        "  Set it in your shell:   export ANTHROPIC_API_KEY=sk-ant-...\n"
        f"  or write it to a local (gitignored) file:\n"
        f"      printf 'sk-ant-...' > {KEY_FILE.relative_to(ROOT)}\n"
        "The key is never committed (.mq-anthropic-key is in .gitignore)."
    )


def load_murals():
    data = json.loads(CONTENT_JSON.read_text(encoding="utf-8"))
    murals = data["murals"] if isinstance(data, dict) and "murals" in data else data
    if isinstance(murals, dict):
        murals = list(murals.values())
    return {str(m["id"]): m for m in murals}


def route_ids(route_id):
    """Pull a route's ordered id list out of ROUTE_DEFS in js/app.js."""
    src = APP_JS.read_text(encoding="utf-8")
    # match: { id: 'downtown-north', ... ids: [6, 116, ...] }
    m = re.search(
        r"id:\s*'" + re.escape(route_id) + r"'.*?ids:\s*\[([0-9,\s]+)\]",
        src,
        re.DOTALL,
    )
    if not m:
        sys.exit(f"Route '{route_id}' not found in {APP_JS.relative_to(ROOT)} ROUTE_DEFS.")
    return [s.strip() for s in m.group(1).split(",") if s.strip()]


def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or "mural"


def build_user_prompt(m):
    parts = [f"Mural #{m.get('id')}"]
    if m.get("t"):
        parts.append(f"Title: {m['t']}")
    if m.get("a"):
        parts.append(f"Artist: {m['a']}")
    if m.get("y"):
        parts.append(f"Year: {m['y']}")
    if m.get("loc"):
        parts.append(f"Location: {m['loc']}  (do not read this aloud — context only)")
    if m.get("insp"):
        parts.append(f"\nInspiration (the artist's stated inspiration — lead with this if it's strong):\n{m['insp']}")
    if m.get("desc"):
        parts.append(f"\nDescription of the physical mural (what is actually on the wall):\n{m['desc']}")
    bio = m.get("bio") or m.get("sbio") or ""
    if bio:
        parts.append(f"\nArtist bio (source of facts — extract, don't recite):\n{bio}")
    parts.append(
        "\nWrite the spoken narration script for this mural, following the voice and "
        "audio rules. Return only the words to be read aloud."
    )
    return "\n".join(parts)


def draft(client, m):
    resp = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": build_user_prompt(m)}],
    )
    if resp.stop_reason == "refusal":
        return None
    return "".join(b.text for b in resp.content if b.type == "text").strip()


def main():
    ap = argparse.ArgumentParser(description="Draft narration scripts via the Claude API.")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--route", help="route id from ROUTE_DEFS, e.g. downtown-north")
    g.add_argument("--ids", help="comma-separated mural ids, e.g. 6,1,23")
    g.add_argument("--all", action="store_true", help="every live mural")
    ap.add_argument("--force", action="store_true", help="overwrite existing draft files")
    ap.add_argument("--print", dest="print_only", action="store_true", help="print to stdout, don't write files")
    ap.add_argument("--limit", type=int, help="stop after N murals (testing)")
    args = ap.parse_args()

    murals = load_murals()

    if args.route:
        ids = route_ids(args.route)
    elif args.ids:
        ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    else:
        ids = list(murals.keys())

    ids = [i for i in ids if i in murals]
    if args.limit:
        ids = ids[: args.limit]
    if not ids:
        sys.exit("No matching murals.")

    try:
        import anthropic
    except ImportError:
        sys.exit("The Anthropic SDK is not installed. Run:  pip3 install anthropic")

    client = anthropic.Anthropic(api_key=load_key())
    if not args.print_only:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    for idx, mid in enumerate(ids, 1):
        m = murals[mid]
        slug = slugify(m.get("a"))
        out = OUT_DIR / f"{mid}-{slug}.txt"
        tag = f"[{idx}/{len(ids)}] #{mid} {m.get('a', '')}".strip()

        if out.exists() and not args.force and not args.print_only:
            print(f"{tag}  — skip (exists; --force to redo)")
            continue

        try:
            script = draft(client, m)
        except Exception as e:
            print(f"{tag}  — ERROR: {e}", file=sys.stderr)
            continue

        if not script:
            print(f"{tag}  — refused / empty, skipped", file=sys.stderr)
            continue

        words = len(script.split())
        if args.print_only:
            print(f"\n===== {tag}  ({words} words) =====\n{script}\n")
        else:
            out.write_text(script + "\n", encoding="utf-8")
            print(f"{tag}  → {out.relative_to(ROOT)}  ({words} words)")

    if not args.print_only:
        print(f"\nDrafts in {OUT_DIR.relative_to(ROOT)}/ — review, then paste the final "
              "text into each mural's `audio:` field and run build-data.py.")


if __name__ == "__main__":
    main()
