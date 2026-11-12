You are updating an EXISTING mural record for the Mural Quest app (St. Petersburg, FL street-art guide).
Repo: the current directory. You run unattended from scripts/newmural_watch.py. Edit ONLY {out} and
{flags} — do not touch any other file, commit, push, deploy or publish.

Rob (the app owner) sent a New Mural intake on {date_long} of a wall we already hold as **#{id}**
({out}). That record is `status: research`: held out of the app because something (usually the
artist) is unknown. Rob's new photos may be the lead that resolves it.

## New field evidence (queue item {qid})
- Photo: {photo}  — look at it with Read
- Signature photo: {sign}  — read exactly what it says
- Rob's note: "{note}"
- GPS where Rob stood: {gps}. Heading: {heading}.

## Task
1. Read the record and what it is missing. Read the signature and the photo.
2. Research the lead: who signed it, the year, the commission. Search the artist's name with
   St. Petersburg / muralist / the business, the business's own site and Instagram, Street Art Cities,
   St Pete Arts Alliance, Tampa Bay Times, Creative Loafing, St Pete Catalyst. grep data/murals/ for the
   name — artist bios are shared between an artist's records, so reuse a sibling's facts.
3. Update the record in place, house style (data/mural-quest-bio-style-card.md):
   - Change `status: research` to `status: draft   # New Mural intake — held out of the app until Rob approves`
     and move it to the line right under `id:`.
   - Set `artist:` only when sources (or a clear, legible signature you can tie to a real artist) support it;
     otherwise keep "Unknown" and record the lead in fieldNotes / sourceNotes.
   - Keep lat/lng and `img:`. If there is no `facing:`, add `facing: <heading>   # look <compass> to see it; Rob, New Mural intake {date_short}` under `lng:`.
   - Never invent a title; `year: 0` unless verified. Every claim needs a source URL in sourceNotes.
   - revisionLog, new first entry: "{date_long} — Lead from Rob's New Mural intake ({qid}); researched by Claude (automatic); held as status: draft for Rob's review".
   - sourceNotes: keep the old lines; add "Rob, New Mural intake {date_short} ({qid}): photo{sign_word}, GPS {gps_short}, heading {heading_short}",
     Rob's note verbatim, every URL used, "Newer photo from this intake: .mq-newmurals/{qid}/photo.jpg",
     and a `⚑ For Rob: ` line for every decision he must make.
4. Re-open every URL you cite and confirm it says what you claim; remove anything unsupported.
Validate: `python3 -c "import yaml; d=yaml.safe_load(open('{out}')); assert d['id']=={id} and d['status']=='draft'"`
Write {flags}: one line per open question. Reply with one line: what you found.
