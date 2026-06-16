# Bio Verification — Methodology & User-Facing Language

## Why this exists

Every artist bio in Mural Quest is a paragraph of factual claims — birth year, schools, awards, exhibitions, mural techniques. Most of these bios were drafted by an LLM from web sources, and LLMs hallucinate. Before launch, we needed to know which claims were actually supported by their cited sources and which were invented or cross-contaminated from a different artist's page.

The verification work documented here was done in April 2026.

## Methodology

### Phase 1 — mechanical pass (all 191 murals)

`scripts/bio-audit-phase1.py` runs without any LLM:

1. **Cache the sources.** Every URL in every YAML's `sourceNotes` is fetched once, HTML-stripped, and saved to `data/source-cache/`. Subsequent runs are local-only.
2. **Build a contamination map.** A `{URL → [artists who cite it]}` index is built. Any URL used by ≥2 artists is a multi-artist source page (festival lineup, group profile, etc.) — these are the highest-risk surface for cross-contamination, where a claim about Artist A on the page can leak into Artist B's bio.
3. **Extract claim atoms from each bio.** Regex pulls factual atoms: institution names ("X University", "X College"), "School of X" patterns, degree codes (BFA, MFA, etc.), award/grant names, birthplaces ("born in X"), and a list of high-risk phrases ("medical illustration", "self-taught"). Bare years are intentionally excluded — too noisy.
4. **Membership check per artist.** For each atom, substring-search the union of that artist's cached source text. Three outcomes:
   - **Supported** → atom is found in this artist's own sources.
   - **Shared-only** → atom is supported, but only by a multi-artist source page. Verify the page actually says it about *this* artist.
   - **Unsupported** → atom appears in none of this artist's sources. If it appears in someone *else's* sources, that's a cross-contamination flag.

The Phase 1 report lives at `docs/bio-audit-phase1-{date}.md`. The April 26, 2026 run flagged:
- 49 artists with at least one unsupported atom
- 4 artists supported only on shared multi-artist pages
- 15 artists with no fetchable source URLs at all (bios cannot be verified mechanically)

### Phase 2 — focused LLM verification (per artist)

For each flagged artist (and each NO-SOURCES artist), a research agent is run with this contract:

- **Input:** the bio + a numbered list of every specific factual claim
- **Task:** web-search and fetch real, citable URLs; per claim, return SUPPORTED (with verbatim quote and source) / UNSUPPORTED / PARTIAL
- **Output:** verified URL list + per-claim verdict + hallucination flags + overall PASS/FAIL

After the agent reports, the YAML is updated:
- `sourceNotes` is replaced with the verified URL list
- The bio is edited to remove or soften any unsupported claims
- A new dated entry is added to `revisionLog`

### Why two phases instead of one

A single full-LLM audit on 191 bios would burn substantial tokens, and the verification step itself uses an LLM that can also hallucinate "this is supported." Phase 1 is mechanical — it cannot lie. It produces a concrete shortlist of suspect claims, and Phase 2 spends LLM capacity only where Phase 1 says it's needed.

The known blind spot of Phase 1: when a multi-artist source page is in an artist's `sourceNotes`, substring match falsely "supports" any text from that page — even text about a different artist. The shared-URL flag is what surfaces this risk; Phase 2 then confirms on a page-section basis.

## Notable findings from the April 2026 run

Three real failure modes confirmed in production:

- **Cross-contamination.** Elizabeth Barenis's old bio claimed "background in medical illustration" — that phrase appears nowhere in any Barenis source, but does appear in Mary Bryson's bio on a shared art-festival page that was in Barenis's `sourceNotes`. The LLM that drafted Barenis's bio had pulled Bryson's biographical detail by accident.
- **Identity conflation.** The SHINE 2016 entry under "Carla Sá Fernandes (Portuguese)" was the wrong artist entirely. The muralist who painted SHINE 2016 under the tag "Caratoes" is Cara To, Belgian-Hong Kong. Carla Sá Fernandes is a real Portuguese abstract painter who has never participated in SHINE.
- **Wrong handle / alias.** Daniel Barojas's bio called him "R3 Imaging / @r3imaging." Every reputable source — Instagram, his own site, St. Pete Arts Alliance, Creative Pinellas — confirms he is "R5 Imaging / @r5imaging."
- **Plausible fabrication.** PHYBR's old bio said he "played in bands" and "rediscovered art around age thirty after a divorce." Neither claim appears in any source. Both were removed.
- **Soft overstatement.** Jimmy Breen's bio said he "designed album art for the Grateful Dead, Bruno Mars, and Green Day." Sources actually say he "designed artwork for" them and was a "merchandise illustrator" — t-shirts and posters, not album covers.

## User-facing language

For the app's About page, marketing brief, or anywhere a reader might want reassurance that we've done the work:

> **Every artist bio in Mural Quest is sourced.** Each entry was drafted from public web sources — the artist's own site, festival pages, press coverage — and then audited claim-by-claim against those sources before launch. We removed unsupported claims and softened overstatements. Sources for each bio are listed in the app under the artist's profile.

Shorter version (one line, e.g. for a tooltip or footer):

> Each bio was drafted from public sources and audited against them. Source list available under each artist.

Even shorter (badge or label):

> Sources verified

## Surfacing sources in the app

`sourceNotes` already exists on every YAML (it's currently stripped during the `build-data.py` step). To surface it to users:

1. Plumb `sourceNotes` through to `data.js` as a compact `src` array (URL strings only, drop the human-readable notes).
2. On the artist detail page, render a small `Sources (N)` disclosure under the bio. Tap to expand a list of clickable URLs.
3. Optional: a subtle "Sources verified" badge near the bio header.

The disclosure approach keeps the page clean for casual readers and provides full transparency for anyone who wants to check the work.

## Re-running the audit

```sh
# Mechanical pass on everything
python3 scripts/bio-audit-phase1.py

# Or just one year's cohort
python3 scripts/bio-audit-phase1.py --year 2025

# Force re-fetch of cached URLs (rare — sources don't change often)
python3 scripts/bio-audit-phase1.py --refetch
```

After editing any bio, re-run Phase 1 on that year and confirm the artist drops out of the FAIL list.
