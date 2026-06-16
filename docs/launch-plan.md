# Mural Quest — Launch Plan (Technical)

**Target launch: May 1, 2026**
**Working document — technical actions only. Marketing actions to be added by Rob.**

---

## Current Status (April 18, 2026)

- App is functional on TestFlight (build 91)
- 156 murals, 100% bio coverage, 6 walking routes
- Compass, haptics, arrival detection, radar blip all working
- Netlify web version live at shinestpetenew.netlify.app
- App Store Connect account active, builds uploading successfully
- No App Store listing submitted yet — app is in TestFlight only

---

## Phase 1: Field Testing & Bug Fixes (April 18–22)

### Goal: Walk all 6 routes downtown and fix everything that breaks.

| Task | Status | Notes |
|------|--------|-------|
| Walk Downtown North route end to end | Not started | 15 stops, ~2 mi |
| Walk The Edge route | Not started | 12 stops |
| Walk Methodist Town route | Not started | 7 stops, shortest |
| Walk Tropicana Field route | Not started | 10 stops |
| Walk Central Ave route | Not started | 9 stops |
| Walk Arts District route | Not started | 13 stops |
| Test compass reliability over full route | Not started | Watch for freezes, note when they happen |
| Test haptic reliability | Not started | Note phone temp, which hits land and which don't |
| Test arrival detection accuracy | Not started | Does it trigger at the right spot? Too early? Too late? |
| Test "gone too far" alert | Not started | Walk past a mural and see if it alerts |
| Verify all GPS positions | Not started | Are pins on the right buildings? |
| Check all mural photos match reality | Not started | Any murals painted over, demolished, or obscured? |
| Test offline mode | Not started | Turn on airplane mode mid-route |
| Test screen wake lock | Not started | Does the screen stay on during walk mode? |
| Fix any bugs found | — | Ship updated builds as needed |

---

## Phase 2: App Store Submission Prep (April 22–25)

### Required by Apple

| Item | Status | Notes |
|------|--------|-------|
| App icon (1024x1024) | Needed | Pelican logo — may need a clean export at this size |
| Screenshots (6.7" and 6.1") | Not started | Need 3-10 screenshots per device size. Take during field testing. |
| App preview video (optional) | Not started | 15-30 second screen recording of compass navigation. High impact for discovery. |
| App description (4000 chars max) | Not started | Write in Mural Quest voice. Use marketing brief as source. |
| Subtitle (30 chars max) | Not started | e.g., "Walk St. Pete's Mural Scene" |
| Keywords (100 chars) | Not started | e.g., "murals,street art,St Petersburg,SHINE,walking tour,mural map,art guide" |
| Privacy policy URL | Done | shinestpetenew.netlify.app/privacy.html |
| Support URL | Needed | Could use Netlify URL or a simple contact page |
| Category | — | Travel or Navigation (primary), Lifestyle (secondary) |
| Age rating | — | 4+ (no objectionable content) |
| Price | — | Free |
| Copyright | Needed | "2026 Rob Asselin" or business entity name |

### App Review Considerations

| Risk | Mitigation |
|------|-----------|
| Compass permission prompt | Make sure the permission dialog is clear and only fires on user action (tap "Enable Compass"). Apple rejects apps that prompt for permissions on launch. |
| Location permission | Same — only request when user starts a tour or enables compass. |
| Minimum functionality | The app works fully without compass/location — users can browse murals, read bios, view map. Compass is opt-in. |
| Metadata accuracy | Don't claim SHINE affiliation if the app isn't officially endorsed by them. Use "featuring SHINE festival murals" not "the official SHINE app." |
| Content rights | All photos are yours. Bios are original. No copyrighted images. |

---

## Phase 3: Submit & Review (April 25–28)

| Task | Status | Notes |
|------|--------|-------|
| Create App Store listing in App Store Connect | Not started | Fill in all metadata from Phase 2 |
| Upload final build | Not started | Ensure this is a clean build with no debug overlays |
| Upload screenshots | Not started | |
| Submit for review | Not started | First submission typically takes 24-48 hours |
| Respond to any reviewer questions | — | Common: "why does the app need location?" — answer: walking tour navigation |
| Fix any rejection issues and resubmit | — | |
| Set release type | — | "Manual release" recommended so you control launch day |

---

## Phase 4: Pre-Launch (April 28–30)

| Task | Status | Notes |
|------|--------|-------|
| App approved and waiting for manual release | — | |
| Final field test of release build | Not started | One last route walk on the actual App Store build |
| Verify App Store listing looks correct | Not started | Screenshots, description, icon all rendering properly |
| Set up custom product page URL if desired | — | e.g., apps.apple.com/app/mural-quest |
| Prepare social media assets | — | (Marketing — Rob to fill in) |

---

## Phase 5: Launch Day (May 1)

| Task | Status | Notes |
|------|--------|-------|
| Release app on App Store | Not started | Click "Release This Version" in App Store Connect |
| Verify app appears in App Store search | — | May take a few hours to index |
| Monitor Xcode Organizer for crash reports | — | Watch first 24-48 hours closely |
| Monitor App Store Connect analytics | — | Downloads, sessions, retention |
| Respond to any user reviews | — | |

---

## Post-Launch Ongoing

| Task | Frequency | Notes |
|------|-----------|-------|
| Add new murals as discovered | Ongoing | Photo → YAML → build-data → cap:sync → ship |
| Update GPS positions from field work | As needed | Route editor → export → apply |
| Fix any reported bugs | As needed | |
| Respond to App Store reviews | Weekly | |
| Update screenshots seasonally | Quarterly | Keep them fresh |
| Monitor for painted-over murals | Ongoing | Mark as "historic" or remove |
| Plan native compass/haptics plugin | Post-launch | Biggest quality-of-life improvement |
| Consider Android release | Post-launch | Capacitor makes this straightforward |

---

## Open Questions

1. **Business entity** — Is the app published under your personal name or a business? Affects copyright line and developer name in App Store.
2. **SHINE relationship** — Any formal partnership or endorsement? Affects what we can say in marketing.
3. **Support channel** — Email? Contact form? Where do users report issues?
4. **Analytics** — Do you want Firebase, Mixpanel, or just App Store Connect analytics?
5. **Monetization** — Free forever, or future plans (tips, premium routes, sponsor spots)?
6. **Domain** — Do you own muralquest.com or similar? Useful for support URL and marketing.
