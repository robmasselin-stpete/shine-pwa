#!/usr/bin/env python3
"""
ig_post.py — post a single mural to the Mural Quest Instagram (v1.5).

Opt-in, per-mural. Prepares an Instagram-ready image, drafts a caption from the
mural's data (already in the Mural Quest voice), lets you edit it, then posts —
with a confirm step so nothing goes public by accident.

  python3 scripts/ig_post.py <mural-id>              # prepare → edit → confirm → post
  python3 scripts/ig_post.py <mural-id> --dry-run    # build + upload + container, NO publish
  python3 scripts/ig_post.py <mural-id> --caption "…" --yes   # scripted, no editor/confirm

Also callable from publish-content.py via `--post <id>`.

Posting goes through the ig.muralquest.app Worker, which holds the IG token
(server-side). This script only needs the local POST key (.mq-ig-post-key,
gitignored). Requires wrangler authenticated for the image upload.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_JSON = os.path.join(ROOT, 'js', 'content.json')
KEY_FILE = os.path.join(ROOT, '.mq-ig-post-key')
POST_ENDPOINT = 'https://ig.muralquest.app/post'
BUCKET = 'muralquest-content'
CDN = 'https://cdn.muralquest.app'
UA = 'Mozilla/5.0 (mural-quest ig_post)'
HASHTAGS = '#MuralQuest #SHINEStPete #StPeteArt #StPete #StreetArt #DTSP'


def load_mural(mid):
    murals = json.load(open(CONTENT_JSON, encoding='utf-8'))['murals']
    return next((m for m in murals if str(m.get('id')) == str(mid)), None)


def first_sentences(text, n=2):
    if not text:
        return ''
    t = text.replace('\n', ' ')
    # Protect common abbreviations so "St. Petersburg" isn't split into a sentence.
    for ab in ['St.', 'Ave.', 'Blvd.', 'Dr.', 'Mr.', 'Ms.', 'Mrs.', 'Mt.', 'Ft.', 'Jr.', 'Sr.', 'No.']:
        t = t.replace(ab, ab.replace('.', '\x00'))
    out = '. '.join(t.split('. ')[:n]).strip().replace('\x00', '.')
    if out and not out.endswith('.'):
        out += '.'
    return out


def draft_caption(m):
    artist = m.get('a', '')
    title = (m.get('t') or '').strip()
    loc = (m.get('loc') or '').strip()
    ig = (m.get('ig') or '').strip()
    lead = first_sentences(m.get('desc') or m.get('insp') or m.get('bio') or '')
    head = f'"{title}" by {artist}' if title else f'Mural by {artist}'
    parts = [head]
    if lead:
        parts.append(lead)
    parts.append(f'📍 {loc}, St. Petersburg' if loc else '📍 St. Petersburg, FL')
    if ig:
        parts.append(f'@{ig}')
    parts.append(HASHTAGS)
    return '\n\n'.join(parts)


def make_ig_image(m):
    """Fit the mural into an IG-compliant canvas (ratio 0.8–1.91) with a blurred,
    darkened fill so the whole mural shows with no ugly bars. Returns a temp path."""
    from PIL import Image, ImageFilter, ImageEnhance
    src = os.path.join(ROOT, m['img'])
    im = Image.open(src).convert('RGB')
    w, h = im.size
    target = min(max(w / h, 0.8), 1.91)
    if target >= 1:
        cw, ch = 1080, round(1080 / target)
    else:
        ch, cw = 1080, round(1080 * target)
    # blurred cover background
    scale = max(cw / w, ch / h)
    bg = im.resize((round(w * scale), round(h * scale)))
    left, top = (bg.width - cw) // 2, (bg.height - ch) // 2
    bg = bg.crop((left, top, left + cw, top + ch)).filter(ImageFilter.GaussianBlur(30))
    bg = ImageEnhance.Brightness(bg).enhance(0.55)
    # sharp fitted image centered
    fit = im.copy()
    fit.thumbnail((cw, ch))
    bg.paste(fit, ((cw - fit.width) // 2, (ch - fit.height) // 2))
    out = tempfile.mktemp(suffix='.jpg')
    bg.save(out, 'JPEG', quality=88)
    return out


def upload_image(local_path, mid):
    key = f'images/ig/{mid}.jpg'
    r = subprocess.run(
        ['npx', 'wrangler', 'r2', 'object', 'put', f'{BUCKET}/{key}',
         '--file', local_path, '--content-type', 'image/jpeg',
         '--cache-control', 'public, max-age=86400', '--remote'],
        cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('✗ image upload failed:', r.stderr.strip().splitlines()[-1:] or r.stderr)
        sys.exit(1)
    return f'{CDN}/{key}'


def edit_caption(draft):
    editor = os.environ.get('EDITOR')
    if not editor:
        print('\n--- draft caption ---\n' + draft + '\n---------------------')
        resp = input('Press Enter to use this caption, or paste a replacement:\n').strip()
        return resp or draft
    tf = tempfile.mktemp(suffix='.txt')
    open(tf, 'w', encoding='utf-8').write(draft)
    subprocess.run([editor, tf])
    return open(tf, encoding='utf-8').read().strip()


def post(image_url, caption, dry):
    if not os.path.exists(KEY_FILE):
        print(f'✗ missing {KEY_FILE} (the Worker POST key).')
        sys.exit(1)
    key = open(KEY_FILE, encoding='utf-8').read().strip()
    url = POST_ENDPOINT + ('?dry=1' if dry else '')
    data = json.dumps({'image_url': image_url, 'caption': caption}).encode()
    req = urllib.request.Request(url, data=data, method='POST',
                                 headers={'Content-Type': 'application/json',
                                          'x-post-key': key, 'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read().decode())
        except Exception: return {'error': f'HTTP {e.code}'}


def post_mural(mid, dry=False, caption=None, yes=False):
    m = load_mural(mid)
    if not m:
        print(f'✗ mural id {mid} not found in content.json (run build-data.py?)')
        return False
    print(f'→ Preparing IG post for #{mid}: {m.get("a","")} — {(m.get("t") or "untitled")}')
    img_path = make_ig_image(m)
    image_url = upload_image(img_path, mid)
    print(f'  image → {image_url}')
    if caption is None:
        caption = draft_caption(m)
        if not yes:
            caption = edit_caption(caption)
    print('\n--- caption to post ---\n' + caption + '\n-----------------------')
    if not yes and not dry:
        if input('\nPost this to Instagram? [y/N] ').strip().lower() != 'y':
            print('Cancelled — nothing posted.')
            return False
    res = post(image_url, caption, dry)
    if res.get('ok') and res.get('dry'):
        print(f'✓ DRY RUN ok — container {res.get("creation_id")} status {res.get("status")} (NOT published).')
        return True
    if res.get('ok'):
        print(f'✓ POSTED to Instagram (media id {res.get("id")}).')
        return True
    print('✗ post failed:', json.dumps(res)[:500])
    return False


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        return
    mid = args[0]
    dry = '--dry-run' in args
    yes = '--yes' in args
    caption = None
    if '--caption' in args:
        caption = args[args.index('--caption') + 1]
    post_mural(mid, dry=dry, caption=caption, yes=yes)


if __name__ == '__main__':
    main()
