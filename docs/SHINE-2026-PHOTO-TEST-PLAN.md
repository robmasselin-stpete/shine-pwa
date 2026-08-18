# SHINE 2026 — Photo Pipeline Test Plan

Goal: **ironclad confidence** that the daily construction-photo pipeline works before
SHINE (Nov 8–17, 2026), and a working demo to show the SHINE people in **early September**
for advertising.

## The chain being tested (4 links)
1. **Capture PWA** (iPad) — photo → updates the mural's `photos[]` → commits image + YAML via GitHub API.
2. **GitHub Action** — fires on commit → rebuilds `content.json` → uploads it + the image to the CDN.
3. **CDN / OTA** — the live app fetches the new `content.json` on next launch (~1 min edge cache).
4. **Build-viewer** — the app renders the new frame.

**Already proven:** link 2 (a commit bumped live `content.json` in ~40s).
**Not yet proven end-to-end:** links 1, 3, 4 — and none of it with a real photo.

## Prerequisites (must exist before this test can run)
- [ ] **App binary with the build-viewer is SHIPPED + live** (App Store + Play). Build-viewer is
      app code — you can't test the pipeline against the live app until it's released.
      → Ship in **August**; reviews take a few days; live late-Aug.
- [ ] **Capture PWA built** — its own repo + a fine-grained GitHub PAT (repo contents, expiry AFTER Nov 17).
- [ ] **A real 2026 mural stub** in production to publish into (any wall as a stand-in for the rehearsal).

---

## Part A — component smoke tests (each link alone)
- [ ] **Action + image:** commit a real image + a `photos[]` entry → confirm the image is live at
      `cdn.muralquest.app/…` AND `content.json` includes the new frame (not just data).
- [ ] **Capture PWA publish:** one photo → confirms a single commit lands (image + YAML) with the PAT;
      UI shows clear success.
- [ ] **Build-viewer:** with 1 photo the detail hero is a static image; with ≥2 it's the swipeable strip
      (newest first, dates, autoplay, dots).

## Part B — multi-day dress rehearsal (the core, run in September)
Mirror the festival cadence with a real stub mural + any wall:
- [ ] **Day 1:** iPad capture + publish → within ~2 min a **separate iPhone AND an Android** launch the
      LIVE app and see that photo as the hero (1 photo → static).
- [ ] **Day 2:** capture + publish a 2nd → app now shows the **build-viewer with 2 frames**, newest first,
      dates correct, autoplay works.
- [ ] **Days 3–5:** repeat → frames accumulate in the right order, no gaps, no dupes.
- [ ] **PASS = 5 clean consecutive days.** This proves the actual daily cadence.

## Part C — failure-mode gauntlet (what makes it ironclad)
Run each deliberately; confirm the result:
- [ ] **Weak / cellular signal at the wall** → publish succeeds OR **fails loudly** with a retry
      (never a silent half-commit).
- [ ] **Duplicate / same-date photo** → the **dedupe guard** warns BEFORE publishing.
- [ ] **Undo last publish** → publish a wrong photo, hit Undo → **gone from the live app within ~2 min.**
- [ ] **Remove a specific (not-last) frame** → works.
- [ ] **Big iPad photo** → **downscaled** and commits fast; **HEIC → WebP/JPEG** conversion works
      (iPad shoots HEIC by default).
- [ ] **Already-cached user** → someone who had the app open earlier gets the new photo on next launch
      (~1 min), not stuck on old.
- [ ] **Both platforms** → new frame renders on **iOS and Android** live apps.
- [ ] **PAT validity** → token expiry is set **past Nov 17**.
- [ ] **Order/date integrity** → out-of-order capture (publish an older date after a newer one) sorts
      oldest→newest correctly.

## Part D — the demo (early September, for SHINE / advertising)
- [ ] End-to-end live in front of people: take a photo on the iPad → within ~2 min it's on the phone in
      the live App Store app. That's the money shot for advertising.
- [ ] Rehearse it once solo first so the live demo is smooth.

## Part E — day-before + safety
- [ ] **Day-before smoke test** (morning before SHINE opens): one full capture→publish→see-it-live cycle.
- [ ] **Rollback rehearsal:** practice the git-revert undo once, so a bad mid-festival photo is a known motion.

---

## Timeline (compressed — decided 2026-08-18)
- **Aug (next few days):** finish app-code polish, remove the dummy mural, **ship the binary** (iOS + Android).
- **Late Aug:** binary approved + live (budget for a rejection + resubmit).
- **Late Aug – early Sept:** build the **capture PWA** (own repo + PAT).
- **Early Sept:** Part A + B + C + the **SHINE demo**.
- **Sept–Oct:** buffer + real 2026 mural seeding.
- **Nov 8–17:** live festival — daily captures, all OTA.

## Sequencing takeaway
The pipeline test can only run once **(1) the binary with the build-viewer is live** and
**(2) the capture PWA exists.** So the pressure is on **shipping the binary in August** and
**building the capture PWA right after** — then September is testing + the SHINE demo.
