#!/usr/bin/env python3
"""searchbio-prep.py — assemble per-artist research packets for top expansion candidates.

Writes one prompt file per artist into /tmp/sbio-prompts/<id>-<slug>.txt
containing:
  - artist name
  - existing artistBio (DO NOT CHANGE)
  - concatenated cached source text (capped at 60k chars per source)

Usage:
  python3 scripts/searchbio-prep.py [--top N] [--ids 1,2,3]
"""
import argparse, glob, hashlib, os, re, sys, json
import yaml

CACHE = '/Users/robasselin/shine-pwa/data/source-cache'
OUT = '/tmp/sbio-prompts'

def cache_path(url):
    h = hashlib.sha1(url.encode()).hexdigest()
    return os.path.join(CACHE, f'{h}.txt')

def words(s): return len(re.findall(r'\w+', s or ''))

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')[:40]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=30)
    ap.add_argument('--ids', type=str, help='comma-separated IDs')
    args = ap.parse_args()

    rows = []
    yaml_by_id = {}
    for f in sorted(glob.glob('/Users/robasselin/shine-pwa/data/murals/*.yaml')):
        if '/_' in f: continue
        d = yaml.safe_load(open(f))
        if not isinstance(d, dict): continue
        bio = (d.get('artistBio') or '').strip()
        sbio = (d.get('searchBio') or '').strip()
        bio_w = words(bio)
        sn = d.get('sourceNotes') or []
        if isinstance(sn, str): sn = [sn]
        urls = [u for u in sn if isinstance(u, str) and u.startswith(('http://','https://'))]
        src_w = sum(words(open(cache_path(u), encoding='utf-8').read())
                    for u in urls if os.path.exists(cache_path(u)))
        if not bio_w: continue
        distinct = sbio and sbio != bio
        ratio = src_w / max(bio_w, 1)
        rows.append({
            'id': d['id'], 'artist': d.get('artist',''), 'file': f,
            'bio': bio, 'distinct': distinct, 'urls': urls,
            'bio_w': bio_w, 'src_w': src_w, 'ratio': ratio,
        })
        yaml_by_id[d['id']] = d

    if args.ids:
        wanted = set(int(x) for x in args.ids.split(','))
        rows = [r for r in rows if r['id'] in wanted]
    else:
        # Top-N candidates: no distinct sbio + sources >= 3x bio words
        rows = [r for r in rows if not r['distinct'] and r['src_w'] >= r['bio_w']*3 and r['urls']]
        rows.sort(key=lambda r: -r['ratio'])
        rows = rows[:args.top]

    os.makedirs(OUT, exist_ok=True)
    # Clear old prompts
    for f in glob.glob(f'{OUT}/*.txt'): os.remove(f)

    for r in rows:
        # Concat cached source text per URL with separators; cap each at 60k
        chunks = []
        for u in r['urls']:
            p = cache_path(u)
            if not os.path.exists(p): continue
            try:
                t = open(p, encoding='utf-8').read()[:60000]
            except: continue
            if t.startswith('__FETCH_ERROR__'): continue
            # Strip menu noise: collapse whitespace
            t = re.sub(r'\s+', ' ', t).strip()
            chunks.append(f'\n\n=== SOURCE: {u} ===\n{t}')
        if not chunks: continue
        body = ''.join(chunks)
        # Cap whole body at 200k chars to keep prompt tractable
        if len(body) > 200000:
            body = body[:200000] + '\n\n[truncated for length]'

        prompt = f"""# Mural Quest — Search Bio Expansion · Artist #{r['id']}: {r['artist']}

You are writing the LONG search bio (`searchBio`) for this artist.
This bio is for keyword discoverability — never displayed verbatim. Pack in every concrete factual detail from the source material.

## Hard rules
- Same voice and tone as the display bio (below). Same style card: dry, fact-only, no hyperbole, no exclamation points, no "incredible/amazing/stunning", no speculation, active voice.
- DO NOT CHANGE OR REPRINT THE DISPLAY BIO. You are writing a separate longer version.
- Strictly grounded in the source material below — no fabrication. If a fact isn't in the sources, don't include it.
- Target length: 600-1000 words.
- Lead with the same hook the display bio uses, then expand: full origin/training detail, specific clients, awards, exhibition history, festival credits, named projects with years, named collaborators, named locations.
- Pack in PROPER NOUNS — full names of schools, awards, venues, clients, gallery names, project titles. These are the keywords searchers will hit.
- End with website / Instagram handle if mentioned in sources.

## Display bio (do not change — for voice reference)

{r['bio']}

## Source material (cached from sourceNotes URLs)
{body}

## Output

Return ONLY the new searchBio text — no preamble, no commentary, no markdown headers. Just the bio body. It will be pasted directly into the YAML's `searchBio` field.
"""
        out_path = f'{OUT}/{r["id"]:03d}-{slug(r["artist"])}.txt'
        with open(out_path, 'w') as f:
            f.write(prompt)
        print(f'#{r["id"]:>3} {r["artist"][:30]:30} → {out_path}  ({len(prompt)//1000}k chars)')

    print(f'\nWrote {len(rows)} prompts to {OUT}/')

if __name__ == '__main__':
    main()
