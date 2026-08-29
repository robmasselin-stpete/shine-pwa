# JOB SPEC — re-verify the UNSUPPORTED fact-check findings

> **STATUS: COMPLETE for the 54-item list (run 29 August 2026).** All 54 findings were
> re-checked with a full web-search budget, pooling sources by artist. 13 restores were
> applied across 16 records; the rest were confirmed as correctly removed. Every record
> in the list — restored or not — now carries a dated `Re-verify pass` entry in its
> `revisionLog`, so no item here should ever be re-litigated a third time. New sources
> used for a restore were added to that record's `sourceNotes`.
>
> **Sarah Sheppard / University of North Texas: CLOSED 29 Aug — stays removed.** It was
> briefly restored on the understanding that Sarah had supplied the bio herself, then
> reverted: Rob was thinking of **Sara Salem** (#017), a different artist, who did supply
> hers. There is no artist provenance and no reachable source for UNT, so it is out of all
> three records (#50, #111, #126) — this time from the searchBios too, which had quietly
> kept it while the display bios were stripped. Each revisionLog carries a RETRACTION entry
> voiding the short-lived "artist-confirmed" note. Do not restore without a real source.
>
> **The pilot and tour batch 2 are now DONE too (same day).** Their commits were
> `3937a03` (pilot, 14 findings) and `473d277` (batch 2, 32 findings); batch 3 `a5fadaa`
> was already inside the 54-item list. Most of those findings were CONTRADICTED and needed
> no re-check; six were absence-based and were re-verified, yielding **3 more restores**
> (#65 MadC, #157 Blaine Fontana, #170 Paola Delfín). **The whole corpus is now covered.**
>
> **Method note for next time:** search-engine result summaries confabulate. Twice in
> this pass a summary attributed text to a named page that did not contain it (Temple
> Terrace on Zulu Painter's degree; the SPAA page on Drew Merritt's model). Every restore
> below was confirmed by fetching the source itself. Do the same.
Written 29 August 2026. Companion to memory `project-mural-factcheck-sweep`.
## Why this exists
The August 2026 sweep checked all 188 mural bios and applied 209 corrections. About a
quarter of those were UNSUPPORTED verdicts — "no source says this" — and content was
DELETED on that basis. That is a claim about ABSENCE, and absence cannot be established
by fetching a known list of URLs. From batch 3 onward the session's WebSearch budget was
exhausted (200/200), so agents verified by direct fetching only. Several said so
explicitly in their own verdicts. CONTRADICTED findings are unaffected: a source
actively saying otherwise stands regardless of search.

So a false positive here means a TRUE fact was removed from the app. That is the risk this pass exists to close.
## Before you start
- Raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` and **restart** — it is read at
  startup, and 200 will not cover this list.
- Pool sources by ARTIST, not by record. See memory `reference-mural-bio-sources-are-shared`.
  Judging a record alone manufactures false UNSUPPORTED verdicts; that is what this
  pass is correcting for.
- Every change is recorded in each YAML's `revisionLog` under a `Fact-check fleet`
  entry dated 27 or 28 August 2026. That is how you restore anything wrongly removed.
## Method
For each item: search properly for support. If found, RESTORE the removed text and
note it in `revisionLog`. If still nothing, leave it and add a line recording that a
full-search pass also found nothing — so this is never re-litigated a third time.
## The list — 54 findings from batches 3-10

### #9 — Isac Gres
- **artistBio** (medium) — removed: "He left Cuba on November 12, 2019"
  - checker said: No pooled source gives a day-level departure date. The Patti Suzette artist bio (recovered from the Wayback snapshot of the dead sourceNotes URL, http://web.archive.org/web/20260218052605/https://www.pattisuzette.com/copy-of-chase…
- **searchBio** (medium) — removed: "He has an NFT collection on OpenSea."
  - checker said: None of the pooled sources mentions NFTs or OpenSea: not the Patti Suzette bio or its available-works list (http://web.archive.org/web/20260218052605/https://www.pattisuzette.com/copy-of-chase-parker), not the Artisan Magazine int…

### #11 — John Vitale
- **searchBio** (low) — removed: "They host events like Hot Walls during SHINE."
  - checker said: The only source covering Hot Walls dates it to July, not the October SHINE festival, and does not tie it to SHINE: 'On July 12, more than 20 of the hottest names in Tampa Bay street arts debuted new murals at Hot Walls, an epic ni…

### #13 — Karel Garcia
- **artistBio** (medium) — removed: "His SHINE 2025 mural was his first public art installation in America."
  - checker said: No source in the pooled set states this, and it is a specific 'first ever' claim. Creative Pinellas (archived 2026-01-16, https://creativepinellas.org/artist/karel-garcia/) says only: 'he emigrated to Florida, USA, where he has pa…
- **artistBio** (low) — removed: "Karel Garcia was born December 27, 1990 in Vedado, Cuba."
  - checker said: The birth date is supported; the birthplace is an over-read of the only source. Creative Pinellas (archived, https://creativepinellas.org/artist/karel-garcia/) reads: 'The artist, born on December 27, 1990, showed an early interes…

### #19 — Zulu Painter
- **artistBio** (medium) — removed: "He holds a degree in fine arts painting"
  - checker said: No biographical source mentions any degree. His own about page (https://zulupainter.com/about) has no education section; the longest first-person bio, https://longridgereview.com/carlos-culbertson/, says only 'Carlos Culbertson is…
- **artistBio** (low) — removed: "In Charleston, West Virginia he painted "Cultivate Kindness," a 40-foot mural made with West Side Middle School students."
  - checker said: Title, city and school collaboration all check out — 'Artist Carlos Culbertson (Zulu Painter) worked with City of Charleston's Office of Public Art and West Side Middle School students' (https://www.charlestonwv.gov/cultivate-kind…
- **searchBio** (high) — removed: "He has also been recognized with a 2021 Business Arts Award, was a winner of the 2021 UF Big Idea Competition, has been published in a Springer Scient"
  - checker said: None of the pooled sourceNotes (zulupainter.com/about, creativepinellas.org/magazine/the-mindful-murals-of-zulu-painter/, creativepinellas.org/artist/zulu-painter/, goldenpaintworks.com/mural-makers-zulu-painter/, paintmemphis.org…

### #23 — Emmanuel Jarus
- **artistBio** (medium) — removed: "A 17-story building in Boulogne-sur-Mer, France."
  - checker said: No cited source attributes 17 stories to the Boulogne-sur-Mer wall. I Love the Burg describes that wall only as "a seaside building in France for the Festival Street Art de la ville de Boulogne-sur-Mer in 2022". The article's only…

### #35 — Andrea Wan
- **searchBio** (low) — removed: "and walls in Germany, Italy, Denmark, and Finland"
  - checker said: https://www.andreawan.com/murals corroborates Germany (Mindspace Mural, Berlin 2018; Witching Hour, Berlin 2017), Italy (A Mirror for Each Other, Rome 2017) and Denmark (Horses, Horsen 2015), but lists no Finland wall — the non-li…

### #36 — Artist Jones
- **artistBio** (high) — removed: "She was born in Trinidad and Tobago, and the Caribbean tones show"
  - checker said: No cited source states a Trinidad and Tobago birth or Caribbean origin. Her own site (https://www.traceyrjones.com/) describes her as a "Professional Muralist, Painter and Graphic Designer based in Tampa Bay" and says only "My fam…

### #38 — Bunnie Reiss
- **artistBio** (medium) — removed: "She's painted walls in over 20 countries"
  - checker said: No cited source states a country count. Her own mural map lists international work only in Mexico (San Pancho, Mexico City, Guadalajara), the Philippines (Manila), Canada (Vancouver, Ontario) and Italy (Florence) — https://bunnier…

### #41 — Fabstraq
- **artistBio** (medium) — removed: "He also works as an audio engineer and music producer, and writes poetry."
  - checker said: No source in the pooled set mentions audio engineering or music production. The artist's own (now-dead) about page describes him only as a visual artist and poet: "From paintings to poetry, this multifaceted artist delivers inspir…
- **artistBio** (medium) — removed: "His eventual goal is to travel worldwide establishing art programs."
  - checker said: The artist's own site states a different stated goal: "Fabstraq's future goal is to continue to pursue and build on his dream of sharing his SOUL; his Fabstraq Art with THE WORLD and to continue to help fellow Artists achieve thei…
- **artistBio** (low) — removed: "He has no formal art education."
  - checker said: None of the pooled sources state this. The artist's own bio (http://web.archive.org/web/20200617233419/https://fabstraq.com/pages/about-shawn) says only that he "has been creating art since his early childhood" and that "Throughou…

### #44 — HOXXOH
- **searchBio** (high) — removed: "He has a separate venture, HOXXOH Champagne, producing fully luminous champagne bottles — Hoxxoh Gold, Hoxxoh Ruby, Hoxxoh Grand Cru, and Hoxxoh Saphi"
  - checker said: The product names are real but belong to an unrelated French luxury champagne brand, and nothing links it to the artist. https://www.hoxxoh.com/ and https://www.hoxxoh.com/collections/all are a champagne store (HOXXOH Gold/Ruby/Gr…

### #45 — Kelly Quinn
- **artistBio** (medium) — removed: "She was Artist-in-Residence at The Florida Aquarium — live-painting, teaching classes, collaborating with educators."
  - checker said: This is the lead sentence of BOTH artistBio and searchBio, but no reachable source states she held an Artist-in-Residence position, nor the specific activities (live-painting, teaching classes, collaborating with educators). Her o…

### #50 — Sarah Sheppard
- **artistBio** (low) — removed: "Sarah Sheppard grew up in Dallas, studied photography, drawing, painting, graphic design, ceramics, and fabric art at the University of North Texas"
  - checker said: No reachable source names any school. Voyage Houston lists the same subject list with no institution: "Throughout school, I studied photography, drawing, painting, graphic design, ceramics, and fabric art. Pretty much anything I c…

### #59 — Dreamweaver
- **other** (medium) — removed: "Mother-daughter duo Dreamweaver"
  - checker said: fieldNotes entry (sibling record 007-dreamweaver-2025.yaml states it as "Mother-daughter duo with Denise Weaver"). Every reachable source describes Dreamweaver as one person, Taylor Smith, working solo: St. Petersburg Arts Allianc…

### #69 — Sydney Prusso
- **artistBio** (medium) — removed: "Clients include Salesforce, Adobe, Dickies, PepsiCo, John Deere, Stihl, the NFL, and AstraZeneca."
  - checker said: Only three of the eight named clients are supported. The client logo strip on https://sydbloom.com/about consists of exactly these assets: adobe, dickies, fk (Fresh Kitchen), grow (Grow Financial), pan, rapid7, salesforce, shine.…

### #70 — Tasko
- **artistBio** (low) — removed: "His work is "loud, colorful and in your face" — flashy lettering in spray paint with fifteen-plus years of practice."
  - checker said: The "fifteen-plus years" half is solidly sourced — SPAA 2018: "Having practiced his art for over 15 years, he is best known for his unique style of lettering that explodes with color. Working with spray paint has always been his m…

### #75 — Bakpak Durden
- **artistBio** (medium) — removed: "His first solo museum exhibition sold out at Cranbrook Art Museum."
  - checker said: The Cranbrook exhibition page for "Bakpak Durden: The Eye of Horus" (Nov 5, 2022 - Mar 12, 2023) confirms it was Durden's first solo museum exhibition and the inaugural Fresh Paint show, but contains no mention of the show or any…

### #94 — Ya La'Ford
- **artistBio** (low) — removed: "Her work is in the collections of Tropicana Field, Al Lang Stadium, the Morean Arts Center, and the Boston Public Library."
  - checker said: No reachable pooled source mentions the Boston Public Library. Her own about page lists collections as "the Bill & Melinda Gates Foundation, the Vinik Family Foundation, and Nike" (https://www.yalaford.com/about); her press page l…

### #103 — Lili Yuan
- **artistBio** (medium) — removed: "She left Hangzhou, China at thirteen for education."
  - checker said: No source in the pooled set names any Chinese city as her hometown. The VoyageMIA interview that is the origin of the age-13 detail says only: "Although I was born and raised in China, I've been away from home since I was 13 years…

### #104 — Mason Schwacke
- **searchBio** (low) — removed: "He is also associated with the Art Asylum creative community."
  - checker said: No cited source names Art Asylum. Not in the St. Pete Arts Alliance artist bio (https://stpeteartsalliance.org/shine-mural/2020_shine_mural_mason_schwacke/), not in the St. Pete Catalyst profile, which 'contains no information abo…

### #107 — Melanie Posner
- **searchBio** (low) — removed: "Melanie "Mel" Posner was born around 1993 in a small town just outside Philadelphia."
  - checker said: The only source addressing her origin calls her a city native, not suburban: St. Pete Catalyst says "the 25-year-old Philadelphia native" (https://stpetecatalyst.com/melanie-posner/, Sept 2019 - which does support "born around 199…

### #112 — Alex Pardee
- **searchBio** (low) — removed: "Cage (Hell's Winter, Kennylz, I Never Knew You EP, Depart from Me)"
  - checker said: "Kennylz" is part of the rapper's name, not a release. Wikipedia's list reads "* [[Cage (rapper)|Cage Kennylz]] ** ''Hell's Winter'' (Tour DVD) ** ''I Never Knew You'' EP ** ''[[Depart from Me]]''" — the bio appears to have mis-pa…

### #121 — Palehorse
- **other** (medium) — removed: "Designed album art for Shinedown"
  - checker said: fieldNotes entry. No source backs it. His own portfolio lists album/poster credits (e.g. 108 'Threefold Misery' album artwork, Converge, Foo Fighters, QOTSA, Puscifer, Primus, Rush posters) but a site search returns nothing for Sh…

### #125 — Illsol
- **artistBio** (low) — removed: "Clients include T-Mobile, the City of Tampa, and the Tampa Convention Center."
  - checker said: Two of the three check out but T-Mobile appears in no source. Illsol's own project index names "Tampa Convention Center Interior Mural" and "Dream Pushers (Commissioned by the City of Tampa)" — plus "City of Clearwater Railroad Hi…

### #126 — Sarah Sheppard
- **artistBio** (medium) — removed: "studied at the University of
  and trained in metalsmithing at Creative Side Jewelry Academy in
  Austin to continue work her late father began."
  - checker said: The artistBio sentence is truncated mid-institution-name ("studied at the University of" with no school following), and no reachable source names any university she attended. Voyage Houston (https://voyagehouston.com/interview/art…

### #137 — Sydney Prusso
- **artist** (high) — removed: "The Fairgrounds St. Pete wall — this wall, at 2606 Fairfield Ave S in the FloridaRAMA / Factory complex — was painted for the venue's September 2021 o"
  - checker said: No source in the pooled Prusso evidence base (this record's 4 URLs plus the 8 in sibling #069) connects Sydney Prusso to Fairgrounds St. Pete / FloridaRAMA. Her studio site lists commissions with no Fairgrounds entry: https://sydb…

### #141 — Daniel Mrgan
- **artistBio** (low) — removed: "He earned a graphic design degree from St. Petersburg College and also studied at Schiller International University."
  - checker said: The Creative Loafing profile says only that he attended both, naming no degree or major: "While studying at Schiller International University and St. Petersburg College, he began making wood burnings of whimsical characters" (http…

### #143 — Reda3sb
- **searchBio** (medium) — removed: "He also runs Delgado's Painting LLC. Instagram: @reda3sb."
  - checker said: The only source cited for this, https://www.instagram.com/delgadospainting0/, is a painting company located in "Houston, TX" — phone (281) 738-0826 (Houston area code), email jd589550@gmail.com, site www.delgadospaintingllc.com —…

### #148 — Caratoes
- **artistBio** (medium) — removed: "She painted SHINE 2016 (this wall) and returned for SHINE 2022."
  - checker said: No fetched source mentions Caratoes and SHINE at all. The only SHINE-specific citation, https://stpeteartsalliance.org/shine-2016, is dead (404), and https://stpeteartsalliance.org/shine/ carries no artist roster. Her own site (ht…

### #152 — Sebastian Coolidge & Rif Raf Giraffe
- **other** (medium) — removed: "artistAwards: "SHINE 2018 selected artists; SpraySeeMO co-founder (Rif Raf Giraffe)""
  - checker said: Neither artist appears on the SHINE 2018 announced lineup (https://www.cltampa.com/arts/here-are-the-new-artists-for-shine-mural-festival-in-st-petersburg-12247508/) nor in the SHINE 2018 festival recap of the 37 selected artists…

### #154 — Justin Bass
- **searchBio** (medium) — removed: "Justin Bass turned that flight into a mural on Central Avenue 112 years later."
  - checker said: 1914 + 112 = 2026, so this (and the repeated 'The flamingo is the 112-year update' in searchBio and 'The boombox is the 112-year update' in muralInspiration) asserts a 2026 painting date. No source establishes when the mural was p…
- **searchBio** (low) — removed: "the pair were described as "the dynamic duo" by Project In The Paint"
  - checker said: A direct quotation attributed to a named publication that appears nowhere in sourceNotes (no Project In The Paint URL is cited) and is not corroborated by any reachable source. https://ryanzookart.com/ (Zook's own site, cited in s…

### #160 — Art of Slim
- **searchBio** (medium) — removed: ""Love Not Litter Extension" (2020, same location, with Taylor Renee)"
  - checker said: No source in the pooled set mentions a 2020 mural, an "extension", or a collaborator named Taylor Renee. PalmettoPride's own article on the Candi Lane project names only "Austin 'Slim' Gee" and says nothing about Taylor Renee or a…
- **searchBio** (low) — removed: "community art programming including "Sketch and Sip" events and children's art classes"
  - checker said: The residency's own artist page names a differently-titled event series: during his residency Slim "taught art classes for adults and children, facilitated 'Drink and Draw events,' and created two one-of-a kind murals installation…

### #164 — Morgan Harper Nichols
- **artist** (medium) — removed: "artist: Morgan Harper Nichols  /  address: "1901 Central Ave" (octopus mural, Art Jewelry Boutique)"
  - checker said: None of the nine reachable sourceNotes URLs mentions a mural, a wall, or St. Petersburg, Florida at all — they are all biographical (Wikipedia, her own bio, UGA directory, TWLOHA board, Lindenwood, Frontgate/PW book-deal items, Ga…

### #168 — Carrie Jadus
- **searchBio** (low) — removed: "the Nikola Tesla portrait at 22nd St S and 5th Ave S, painted with assistant Tara Radosevich over two weeks"
  - checker said: The assistant's name is correct, but no source in the pooled set gives a two-week duration for the Tesla mural, and the source that documents the assistants names three, not one: "But the Tesla Mural and Little Miss Sisyphus were…

### #171 — Taj Tenfold
- **artistBio** (low) — removed: "studied Illustration at the Edna Manley College of the Visual and Performing Arts in Kingston (2007-2011)"
  - checker said: The school and the illustration major are supported — ba-reps.com: "Graduated from Edna Manley College of Visual Arts with a major in 'illustration'" (https://www.ba-reps.com/illustrators/taj-francis), same on https://www.tajtenfo…

### #176 — Drew Merritt
- **other** (low) — removed: "The model is Kari Michelle."
  - checker said: In searchMuralDescription. A named private individual identified as the mural's model with no citation. The record's only third-party mural source, https://www.visitstpeteclearwater.com/profile/mask-off-edge-district/140781, retur…

### #181 — Michael Vasquez
- **artistBio** (medium) — removed: "He is a three-time SHINE artist — 2015, 2023, and 2025."
  - checker said: The SHINE mural database returns only two Michael Vasquez murals — 2015 "Let's Go Back" (https://stpeteartsalliance.org/shine-mural/2015_shine_mural_michael_vasquez/) and 2023 "The Mangrove Refuge (The Vorasane Family and Friends;…

### #182 — Chris Dyer
- **artistBio** (medium) — removed: "He studied illustration at Dawson College in Montreal and trained under visionary masters Alex Grey, Robert Venosa, and Amanda Sage."
  - checker said: No pooled source describes Grey, Venosa or Sage as his teachers, and the relationship the sources do describe is the opposite direction. Wikipedia: he "has shown with renowned artists such as Alex Grey, Shepard Fairey, Robert Veno…

### #183 — Derek Donnelly
- **other** (medium) — removed: "searchBio: "" (line 112 — a SECOND searchBio key, after the ~600-word searchBio block starting at line 40)"
  - checker said: Not a factual error but a data defect found while checking this record: data/murals/183-derek-donnelly-guardian-gulfport.yaml declares searchBio twice (grep -c '^searchBio:' returns 2). YAML last-key-wins, so yaml.safe_load(...)['…

### #184 — IBOMS
- **artistBio** (medium) — removed: "His solo show "Ego Death" at Mize Gallery sold out in 48 hours."
  - checker said: The only source in the pooled IBOMS evidence base that describes the 48-hour sellout is I Love the Burg (Oct 11, 2021, Andrew Harlan): "Jabari's work has been featured in the new d-Gallerie, in addition to MIZE Gallery. His show w…
- **artistBio** (medium) — removed: "He designed a Tampa Bay Rays Artist Print Series in 2019."
  - checker said: No pooled source mentions the Tampa Bay Rays at all. The archived Creative Pinellas artist profile (http://web.archive.org/web/20260518071047/https://creativepinellas.org/artist/jabari-reed-diop-i-b-o-m-s/, posted March 28, 2023)…

### #186 — Chris Dyer
- **artistBio** (medium) — removed: "trained under visionary masters Alex Grey, Robert Venosa, and Amanda Sage"
  - checker said: No pooled source describes Dyer as a student of these three. Wikipedia frames the relationship the other way round: "He has shown with renowned artists such as Alex Grey, Shepard Fairey, Robert Venosa, H.R. Giger, and Romio Shrest…

### #194 — Blake Emory &amp; Guillo Perez III
- **artistBio** (medium) — removed: "Optic Modernism (in "Neo-Renaissance figure painting, Optic Modernism, sculpture, set design, experimental film")"
  - checker said: Neither biography source contains the term "Optic Modernism". https://marcolinas.com/pages/blake-emory names his movements as "Etherealism (founded 2023) and Neo-Renaissance" and the collection page says "Founder of the Etherealis…

### #198 — James Oleson
- **searchBio** (medium) — removed: "He is described in St. Pete press coverage as a "renowned sculptor and muralist" who curates exhibits at the Bloom property to complement existing mur"
  - checker said: The only St. Pete press coverage in the sourceNotes is the Crow's Nest article, which contains neither the phrase nor the curating claim. Its only two Oleson sentences are: "The event was planned and organized by James Oleson and…

### #199 — Zulu Painter
- **searchBio** (medium) — removed: "He has also been recognized with a 2021 Business Arts Award, was a winner of the 2021 UF Big Idea Competition, and was featured in the Innovate Gaines"
  - checker said: None of the seven reachable sources in the pooled Zulu Painter evidence base (records #019, #034, #199) mention any of these three awards/credits. The artist's own bio page lists only studio details, media and the "Mindful Murals"…

### #203 — Blake Emory
- **artistBio** (medium) — removed: "Blake Emory is a Florida native, born 1983, now based in St. Petersburg."
  - checker said: Neither biographical source carries a birth year or birthplace. His own site's bio (https://www.emorybrothersart.com/biography) says only that the brothers were 'raised in an unconventional family of artists, inventors, and musici…

### #209 — BASK
- **searchBio** (low) — removed: "This is a 2026 wall at Overspray in Gulfport"
  - checker said: No source establishes a painting year. The record's own `year:` field is 0 (unknown) and the revisionLog/verification block never asserts 2026; the only dated evidence is Rob's photo of 2026-05-13, which establishes only that the…

## Pilot + tour batch 2 — DONE 29 August 2026
Recovered from commits `3937a03` (pilot) and `473d277` (batch 2) by diffing what each
actually deleted and reading the revisionLog reasons. Of ~46 findings, the great majority
were CONTRADICTED (a source actively said otherwise) and needed no re-check. Six were
absence-based:

| Finding | Verdict |
|---|---|
| #18 + #113 Morning Breath — "Cunningham studied at the Academy of Art University" | stays removed; no source names any school for either partner |
| #18 Morning Breath — Apple as a client | stays removed; their own list has no Apple (their monograph is sold on Apple Books — likely the origin) |
| #32 Up & Over — "September 2020" formation | stays removed; no source dates it to a month |
| #65 MadC — "broken her own record twice since" | **PARTIALLY RESTORED** — she broke it once, in 2018, with the Chicago 1000-Wall |
| #157 — "featured in Hi-Fructose magazine" | **RESTORED AND REATTRIBUTED** — true of Blaine Fontana (Vol. 36, 2015), not of PlasticBirdie |
| #170 Paola Delfín — Universidad Iberoamericana / Buenos Aires / St+Art India / POW! WOW! | **St+Art India RESTORED** (three 2023 murals); the other three stay removed |

**#157 is the instructive one.** The Aug 27 check searched Hi-Fructose for "the artist"
and found nothing — but this is a *two-artist* record, and the magazine had featured the
other half. On a shared record, check the claim against **every** artist named before
calling it unsupported. Same failure family as the pooled-sources problem in
`reference-mural-bio-sources-are-shared`.

Also found twice in this sweep, as with Sarah Sheppard earlier: a claim stripped from the
display bio while the searchBio quietly kept it (#170 Buenos Aires, #65 MadC). **When
removing a claim, remove it from every field in the record.**

## Known weak spot, flagged during the sweep
`University of North Texas` was removed from three Sarah Sheppard records (#50, #111,
#126) as unsourced — but #126 had been audited in April and KEPT it. If a source turns
up, restore all three. Also #104 Mason Schwacke's "shown work at Portspace Gallery in
Gulfport" was flagged as having the same evidentiary status as the Art Asylum line that
was removed, but was never itself confirmed — check it here.

## Rule added 29 Aug 2026 (Rob)
When a restore is justified by a source that is NOT already in that record's
`sourceNotes`, ADD the URL to `sourceNotes` as part of the same edit. The
revisionLog says what changed; sourceNotes must carry the evidence.
