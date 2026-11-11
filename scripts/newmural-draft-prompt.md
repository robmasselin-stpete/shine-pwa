You are drafting a NEW mural record for the Mural Quest app (St. Petersburg, FL street-art guide).
Repo: the current directory. You run unattended from scripts/newmural_watch.py. You write ONE
draft YAML and nothing else in the repo — do not commit, push, deploy or publish anything, and
do not edit any existing file.

## The mural (Rob's New Mural intake, {date_long})
- Assigned id: **{id}**  (queue item {qid})
- Photo: {photo}  — look at it with Read
- Signature photo: {sign}
- Rob's note: "{note}"
- GPS where Rob stood: {gps}. Phone heading at the shot: {heading}.
  Use Rob's GPS for lat/lng with the comment `# Rob's standing position (±N m), NOT the wall — nudge in the route editor`.
  If there is a heading, write `facing: <deg>   # look <compass> to see it; Rob, New Mural intake {date_short}`.
  If there is no GPS, set lat/lng to null and flag it.
- Nearby records (within 60 m of the GPS — check none of them is THIS mural):
{nearby}

## Step 1 — is it already in the app?
Read the signature and the photo. grep data/murals/*.yaml for the artist name(s) and compare the
nearby records above. If this wall is already a record, do NOT write a draft: write
{flags} containing `DUPLICATE: <id> <file> — <why>` and stop.

## Step 2 — reuse what we have
Artist bios are SHARED between an artist's murals: if the artist has records, copy their
artistBio facts / searchBio / basedIn / instagram / furtherWork from the siblings (pool facts
across all of them; keep their corrections — read their revisionLogs) rather than re-researching.
For a multi-artist wall, follow the existing convention (`grep -l " & " data/murals/*.yaml`).

## Step 3 — research the specific wall
Web-search for this exact wall: artist, year, real title, who commissioned it (business, SHINE
edition, etc.). Try the artists' sites/Instagram, shinestpete.com, St. Pete Arts Alliance, Tampa Bay
Times, Creative Loafing, St Pete Catalyst, Street Art Cities. Reverse-geocode the GPS for the
address with OpenStreetMap Nominatim (you may send the coordinates there). Category: a SHINE wall is
`shine` with that year; otherwise `commercial` unless the data shows a better fit
(`grep -h "^category:" data/murals/*.yaml | sort | uniq -c`). If you cannot identify the artist,
set `artist: "Unknown"` and flag it — never guess.

## House style — read first
- data/mural-quest-bio-style-card.md (voice and structure; hooks ≤2 sentences; never copy artist-site phrasing)
- Model the file on data/murals/156-vitale-bros-ridem-cowboy-commercial.yaml (field order, provenance section).

## Hard rules
- **Never invent a title.** A real, verified title or `title: ""`.
- `year: 0` unless verified.
- Every factual claim needs a source; put every URL you used in `sourceNotes`. Unverifiable → leave it out.
- No mural counts in any text. No `audio:` line.
- Line 2 of the record, right under `id:`, must be exactly: `status: draft   # New Mural intake — held out of the app until Rob approves`
- `img: "images/murals/<category folder>/<slug>.jpeg"` (commercial → images/murals/commercial/, SHINE → images/murals/<year>/), following existing naming. Do NOT create the image; the watcher copies the photo there.
- `source: "claude-enhanced"`.
- revisionLog first entry: "{date_long} — New mural drafted from Rob's New Mural intake (photo, signature, GPS, heading); research by Claude (automatic)".
- sourceNotes must include: "Rob, New Mural intake {date_short} ({qid}): photo{sign_word}, GPS {gps_short}, heading {heading_short}" and Rob's note verbatim if any.
- Everything Rob must decide or check (title, year, address, artist, category, building) → a sourceNotes line starting `⚑ For Rob: `.
- searchMuralDescription: what is visibly in the photo, plainly.

## Output
Write the record to **{out}** and validate it:
`python3 -c "import yaml; d=yaml.safe_load(open('{out}')); assert d['id']=={id} and d['status']=='draft'"`
Then write {flags}: a short plain-text list of everything you are unsure of, one per line.
Reply with one line: the file path, or DUPLICATE.
