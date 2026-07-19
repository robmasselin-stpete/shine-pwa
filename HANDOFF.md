# Mural Quest — Session Handoff

> **CURRENT LIVE (App Store): v1.4 (build 131).** **v1.5 is on TestFlight —
> latest build 133 (2026-07-15), field-test stage**, not yet submitted to the App
> Store. (Builds 132→133 same session; 133 adds on-device fixes below.) v1.5 = the
> content-architecture refactor (OTA data + image split + analytics + IG posting).
> Plan: `docs/CONTENT-ARCHITECTURE-PLAN.md`.
>
> **v1.5 shipped this session (all on branch `v1.5`, pushed):**
> - **OTA content** — app fetches `content.json` from R2/`cdn.muralquest.app` at
>   launch (bundled `data.js` fallback). Publish live with `scripts/publish-content.py`
>   (no app build). SW bypasses content.json so it can't shadow updates.
> - **Image split** — bundle 414MB→**35MB**. 384px WebP card tier bundled
>   (`images/cards/`, `generate-cards.py`); full-res on CDN (`publish-images.py`).
> - **Analytics** — `workers/analytics/` at `analytics.muralquest.app` + D1; client
>   `js/analytics.js`. Stats: `analytics.muralquest.app/stats?key=<STATS_KEY secret>`.
> - **Instagram posting** (NO in-app feed — Rob's call) — `workers/ig-feed/` at
>   `ig.muralquest.app` + `scripts/ig_post.py` / `publish-content.py --post <id>`.
> - **185+** count fix.
> - **On-device fixes (build 133, latest TestFlight):** progressive detail hero
>   (bundled card instant → CDN full-res swap, kills tap lag); WiFi-preferred
>   background prefetch of all full-res for full offline (`@capacitor/network`);
>   **crisper 720px cards** (was fuzzy 384px). Bundle ~63MB. **Test 133 on iPhone.**
> - **⚠ DIRECTION CHANGE (2026-07-15): v1.5 is NOT shipping yet.** No deadline forces
>   it, and background location (for narrated tours) faces heavy store review whenever
>   it ships — so rather than ship v1.5 now + a v1.6 later (2× review/testing), **v1.5
>   grows to include the foreground service + background location and becomes the JOINT
>   iOS + Android launch, both complete.** HOLD App Store submission. Keep field-testing
>   133 on iPhone meanwhile (validates OTA/offline/images). Watch for iOS cache eviction
>   of the 373MB prefetch; if it evicts, switch to a ~1080px detail tier.
> - **In parallel now:** Rob starts **ElevenLabs** narration content (independent of the
>   plumbing); Claude does **foreground-service groundwork** (see Android section). S23
>   arrives ~2026-07-18 → real background/GPS/haptic testing.
> - **✅ NARRATION TOOLING (2026-07-15):** `scripts/gen-narration.py` drafts per-mural
>   audio scripts via the Claude API (opus-4-8) → `data/narration/*.txt` for review.
>   Scripts land in each mural's `audio:` YAML field → `aud` in data.js/content.json.
>   Full workflow + secure API-key setup: **`docs/NARRATION.md`**. Rob: drop in the key,
>   then `python3 scripts/gen-narration.py --route downtown-north`.

## 2026-07-15 — Narration script tooling (ElevenLabs tours)

- **`scripts/gen-narration.py`** — drafts per-mural spoken-narration scripts from
  existing mural data (`insp`/`bio`/`desc`) via the **Claude API** (`claude-opus-4-8`,
  adaptive thinking), in the app's bio voice tuned for audio (~100–150 words, numbers
  spelled out, no URLs/handles, end on a real detail). Writes to
  `data/narration/{id}-{slug}.txt` for **review** — never auto-applies. Flags:
  `--route <id>` (reads ordered ids from `ROUTE_DEFS`), `--ids`, `--all`, `--force`,
  `--print`. Full doc: **`docs/NARRATION.md`**.
- **Data path:** the script text goes in a mural's **`audio:`** YAML field →
  `build-data.py` emits it as **`aud`** in both `js/data.js` and `js/content.json`.
  All 189 murals currently have an empty `aud`. Apply = paste final → build-data.py →
  publish-content.py (OTA, no rebuild).
- **API key handling (never committed):** reads `ANTHROPIC_API_KEY` env, else a
  gitignored **`.mq-anthropic-key`** file at repo root (added to `.gitignore`). Rob
  sets it in his own shell / on disk — not pasted in chat (same model as
  `.mq-ig-post-key`). Anthropic Python SDK installed (`pip3 install anthropic`, 0.116.0).
- **NEXT:** Rob drops in the key → `gen-narration.py --route downtown-north` (16 stops)
  → review drafts → apply. Then wire proximity → audio into the tour flow (needs the
  foreground-service background-location work; S23 ~2026-07-18).

## 2026-07-19 — GOTCHA: bg-geo plugin merged foreground-service perms (stripped)

- During Play internal-testing setup, the **App content ▸ Foreground service permissions**
  declaration flagged that the app requests `FOREGROUND_SERVICE_LOCATION`. **We never
  declared it** — the `@capacitor-community/background-geolocation` plugin (installed for
  the FUTURE narrated-tours foreground service, NOT wired into this build) merges in
  `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` permissions AND a
  `com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService`
  (type=location) via manifest merge.
- **Fix:** stripped all three from `android/app/src/main/AndroidManifest.xml` via
  `tools:node="remove"` (needs `xmlns:tools` on `<manifest>`). Rebuilt → **versionCode 2**.
  Verified merged manifest no longer contains FOREGROUND_SERVICE* or the service;
  ACCESS_FINE/COARSE_LOCATION (foreground GPS) remain. This keeps the app out of Play's
  foreground-service-location declaration + background-location review until we actually
  ship the feature.
- **⚠ WHEN implementing background location (post-S23):** remove those three
  `tools:node="remove"` overrides so the plugin's service + permissions merge back in,
  THEN do the full disclosure/review per `docs/BACKGROUND-LOCATION-REVIEW.md`.
- Uploaded **v2** AAB to the internal track (v1 had the permission; v2 doesn't).

## 2026-07-19 — Android release signing + signed AAB (for Play testing)

- **Upload keystore created + Gradle signing wired.** Ready to upload to Play.
  - Keystore: `android/keystore/mural-quest-upload.jks` (**gitignored** — NEVER commit).
    Alias `upload`, RSA 2048, valid until **2053**. SHA-256 fingerprint:
    `47:F8:D5:8D:EA:F5:34:DC:72:19:90:3E:EF:C6:B7:57:24:54:CE:18:89:22:D5:A8:5B:8F:53:3C:98:04:AA:1D`.
  - Password lives in `android/keystore.properties` (**gitignored**, chmod 600):
    `storeFile / storePassword / keyAlias / keyPassword`. **BACK THIS UP** (password
    manager). With Play App Signing the upload key CAN be reset if lost, but don't rely on it.
  - `android/app/build.gradle` now loads `keystore.properties` and signs `release` when
    present (falls back to unsigned if the file is absent — safe for fresh clones/CI).
    This build.gradle change IS committed (no secrets in it); the keystore + properties are not.
  - **versionCode 1, versionName "1.5"** (first Android build; matches the v1.5 release).
- **Signed AAB built:** `android/app/build/outputs/bundle/release/app-release.aab` — **39 MB**,
  `jar verified` (signed). Rebuild: `cd android && ./gradlew bundleRelease`
  (JAVA_HOME=openjdk@21, ANDROID_HOME=/opt/homebrew/share/android-commandlinetools).
  Bump `versionCode` in `android/app/build.gradle` before each new upload.
- **NEXT (Rob, Play Console clicks): Internal testing** = the TestFlight analog (no review
  wait, up to 100 testers). Steps: create the app → App content declarations (privacy
  policy `muralquest.app/privacy.html`, data safety, content rating, target audience,
  app access) → Testing ▸ Internal testing ▸ create release ▸ upload the AAB → add tester
  emails (email list) ▸ share the opt-in link. Testers install from Play.
- **⚠ Bundle hygiene (not blocking):** the AAB still carries dev cruft the `cap:copy`
  rsync doesn't exclude — `data/` (raw YAMLs, 12MB), `screenshots/` (9MB), `docs/`,
  `scripts/`, `tools/`, `mockups/`, `package-lock.json`. Same issue affects the iOS
  bundle. Trimming these `cap:copy` excludes would roughly halve the bundle. Do before
  public launch.

## 2026-07-15 — Android / Google Play + DUNS (in progress)

- **Decision: go ORGANIZATION accounts on both Apple + Google** (Rob got a DUNS).
  Rationale: org avoids Google Play's **20-tester/14-day** closed-testing gauntlet
  (required for new *personal* Play accounts) and is cleaner long-term.
- **Business entity: Pelican Digital LLC** (Florida). FL document #
  **`L26000196949`** (Sunbiz). This is the legal entity for the Apple + Google
  organization accounts.
- **DUNS number: `145568362`** (one number serves both Apple + Google), tied to
  Pelican Digital LLC. Org name + address entered on the platforms must match the
  D&B / Sunbiz records exactly.
- **✅ UNBLOCKED (2026-07-19): physical Android phone in hand + Google Play login
  done.** The "verify you have an Android device" step that blocked account setup is
  cleared. Remaining account work: confirm whether it landed as **personal** or
  **organization** (org = avoids the 20-tester/14-day closed-testing gauntlet); if
  still personal, do the org conversion + enter DUNS `145568362` (org name + address
  must EXACTLY match the D&B record). See sequence below.
  - **✅ DONE 2026-07-19: account converted to ORGANIZATION.** Pelican Digital LLC.
    - **Developer account ID: `7682684932099684983`**. Account owner rob.m.asselin@gmail.com.
    - Org address on file: 520 25th Ave N, Saint Petersburg FL 33704-2824.
    - **Website `muralquest.app` verified** (green check) — this was the gate to org
      conversion. Verified via Google Search Console (HTML-file method): the file
      `google8d2fd99c7e84a397.html` was deployed to the muralquest.app Netlify site root
      (content `google-site-verification: google8d2fd99c7e84a397.html`). ⚠ **Leave that
      file in place permanently** — removing it un-verifies the site. It lives in
      `~/muralquest-website/google8d2fd99c7e84a397.html` (not this repo).
    - Org account means **no 20-tester/14-day closed-testing gauntlet** — can go
      straight to production track when ready.
- **Unblock sequence once the device arrives:** (1) finish Google Play account
  verification with the device → (2) change account type to **Organization** →
  (3) enter DUNS `145568362` (org name + address must EXACTLY match the D&B record,
  or verification fails). ⚠ Google may not allow switching this personal account to
  org after the fact — may need Play support or a fresh org account. Check at that step.
- **DECISION (REVISED 2026-07-15) — v1.5 WILL add a foreground service + background
  location.** Earlier plan was screen-on-only tours (web Geolocation + `navigator.
  wakeLock`, no foreground service — same as the live iOS app). Rob reversed it: since
  there's no ship deadline and narrated tours need background tracking anyway, do it
  once in v1.5 rather than screen-on-v1.5 + foreground-v1.6 (2× review/testing). The
  foreground service (persistent notification + continuous location) is the delivery
  layer for the **ElevenLabs narrated tours** (phone-in-pocket, proximity-triggered
  audio).
  - **✅ GROUNDWORK DONE (2026-07-15):** `@capacitor-community/background-geolocation`
    installed + configured, Android APK compiles clean. `js/geo-background.js` =
    start/stopBackgroundTour() wrapper (native-only) — the integration point, NOT yet
    wired into tours. iOS Info.plist set (local): NSLocation usage strings +
    `UIBackgroundModes=[location,audio]`. Uses a foreground service (NOT
    `ACCESS_BACKGROUND_LOCATION`) — review-friendly. Store-review justification +
    checklist: **`docs/BACKGROUND-LOCATION-REVIEW.md`**.
  - **NEXT (needs S23, ~Fri 2026-07-18):** wire `geo-background.js` into tour start/stop;
    build the prominent-disclosure screen; test background survival on the S23 (Samsung
    Device Care) + battery; hook proximity → ElevenLabs narration audio.
  - **S23 verification pass — RESULTS (2026-07-19, Galaxy S23 / Android 16):**
    - ✅ **Location permission prompt** fires on launch (Precise/Approximate,
      While-using-the-app) — MainActivity runtime request works on real hardware.
    - ✅ **Map + pins + geolocation** render.
    - ✅ **Safe-area top** — header clears the status bar.
    - ✅ **Safe-area bottom** — was BROKEN (tab bar under nav buttons), native inset shim
      added + re-verified fixed (see Play-readiness bullet above).
    - ✅ **Back → returns to map** from another tab.
    - ✅ **Back → double-back-to-exit** with "Press back again to exit" toast; never a
      silent first-press exit (Play-friendly). Confirmed exits on 2nd back within 2s.
    - ✅ **No crash** (process stayed alive through the pass; logcat clean).
    - ✅ **Detail back** (manual) — open a mural → back → closes detail, not exit.
    - ✅ **Live GPS blue dot** (manual) — tracks on the map.
    - ✅ **Haptics** (manual) — feel good on the S23 motor (the reason for the flagship).
    - **→ Android build FUNCTIONALLY VERIFIED end-to-end on real hardware (2026-07-19).**
    - APK on device is the debug build (402 MB, full-res bundled). Release AAB (~63 MB,
      images excluded) is a separate build step for actual Play upload.
- **✅ Android GPS wired (milestone one done 2026-07-15):** manifest now has
  `ACCESS_FINE_LOCATION`/`COARSE`; `MainActivity` requests the runtime permission on
  launch → Capacitor's WebChromeClient grants the WebView's web geolocation. Verified
  on emulator: prompt fires → granted → coordinate returns → location dot on the map.
  `android/` SOURCE now tracked in git (was ignored). NOTE: this is the *foreground*
  web-geolocation path; the foreground-service work replaces/augments it for background.
- **Test device: refurb Samsung Galaxy S23 5G (128GB) — bought 2026-07-15.** Flagship
  = real haptic FEEL tuning (an A-series motor is too weak to judge feel) + Samsung
  Device Care worst-case background behavior + representative of many real users.
- **Android app runs:** same v1.5 code (re-verified on emulator — 185+/map/tours, no
  crash). Remaining platform work before Play submit: **ads config, signed AAB (63MB)**,
  and on-device verification of the items below. (Location ✅, back-button ✅,
  safe-area/status-bar ✅ code-complete — see next bullet.)
- **✅ Play-readiness code (2026-07-15, code-complete, needs on-device verify):**
  - **Hardware back button** — added `@capacitor/app`; handler at the END of `js/app.js`
    (`initNative()`, native-only). Closes the deepest overlay first (photo lightbox →
    dialog overlay → map help → GoTo mode → detail page), else returns to the map tab,
    else **press-back-twice-to-exit** with a toast (never a silent first-press exit —
    Play-friendly). Reached via `window.Capacitor.Plugins.App` (no bundler).
  - **Status bar / safe-area** — same `initNative()` sets a cream (`#F7F4EF`) status bar
    + dark icons via `@capacitor/status-bar`. The CSS already uses `env(safe-area-inset-*)`
    (`--safe-top`/`--safe-bottom`) throughout, so layout is inset-aware. Deliberately did
    NOT call `setOverlaysWebView` (avoids clipping where env() reads 0).
  - **✅ RESOLVED on S23 (2026-07-19): env() insets DID read 0 → native shim added.**
    Real-device test on the **Galaxy S23, Android 16 (SDK 36)** confirmed the bottom tab
    bar was overlapped by the system nav buttons — Android WebView doesn't populate
    `env(safe-area-inset-*)` (unlike iOS WKWebView), and Android 16 forces edge-to-edge.
    **Fix:** `MainActivity.onCreate` now sets a `ViewCompat.setOnApplyWindowInsetsListener`
    on the bridge WebView that reads the real system-bar insets and injects them into
    `--safe-top`/`--safe-bottom`/`--safe-left`/`--safe-right` (px÷density) via
    `evaluateJavascript`, re-applied on every insets change. iOS unaffected (native code
    doesn't run there; env() stands). Rebuilt + reinstalled → tab bar now clears the nav
    bar, top header clears the status bar. **No app.js/CSS change needed** — the shim
    feeds the same vars the CSS already uses.
  - Bumped `js/app.js?v=144` (index.html) + SW `CACHE_NAME shine-v149`. `cap:sync` run
    (registers `@capacitor/app` in the gitignored native gradle files). Minor dep drift:
    `@capacitor/core` went to 8.4.1 vs `ios@8.2.0` — compatible within 8.x, align later.
- Android toolchain + emulator (`mq_pixel`) installed on Rob's Mac (see spike note
  below). Build APK: `cd android && ./gradlew assembleDebug` (JAVA_HOME=openjdk@21,
  ANDROID_HOME=/opt/homebrew/share/android-commandlinetools).

## 2026-07-07 update (latest) — Android spike SUCCEEDED + content-architecture plan

- **Android spike done — the app builds AND runs on Android**, zero code changes.
  Capacitor 8 project scaffolded (`npx cap add android`), debug APK built, booted
  in an emulator (Pixel 7 / API 36), Mural Quest ran with the full UI, map, and all
  plugins (Haptics/Keyboard/StatusBar). Same `com.muralquest.stpete` id, "Mural
  Quest" label, Android 7+ (minSdk 24 / targetSdk 36).
- **KEY BLOCKER for Play: app size.** Debug APK = **402 MB**, because the web bundle
  is 414 MB — **386 MB of it is mural photos**. Google Play won't take a 402 MB APK
  (~200 MB practical limit). iOS already ships this (415 MB) and Apple allowed it,
  so it's fine on iOS today but blocks Play.
- **This ties into the deferred "instant updates" idea.** Rob wants to push daily
  content updates during the SHINE festival (new murals, titles, stories, routes)
  WITHOUT App Store/Play review. Image hosting (needed for Android size) + remote
  data (needed for daily updates) are the **same architectural pattern** — decided
  to treat them as ONE project. Full plan written to
  **`docs/CONTENT-ARCHITECTURE-PLAN.md`**. Highlights:
  - **Thumbnails are only 6.9 MB** (`images/thumbs/`, used by grid + map); the
    373 MB is full-res detail photos (`images/murals/`, shown one at a time). So:
    **bundle thumbnails (browsing works 100% offline) + remote-host full-res
    photos (load on tap, cache after).** App shrinks 415 MB → ~25 MB on BOTH
    platforms. This neatly solves the walking-tour offline concern.
  - Data (`data.js`, ES-module `export const murals`) + routes (`routes.js`,
    `ROUTE_PATHS`) also move to a fetched-at-launch JSON manifest w/ bundled
    fallback → enables daily updates, no review. Apple/Google both ALLOW OTA
    content/data updates (just not executable code).
  - **Recommended hosting: Cloudflare R2** (zero egress fees, 386 MB fits free
    tier) w/ `cdn.muralquest.app`; Netlify is the lower-friction fallback.
  - **Rollout: iOS first** (remote images → remote data), validate, THEN Android.
  - New `publish-content` step replaces "rebuild app": edit YAML → build-data.py →
    publish → live in minutes. Editor PWAs unchanged.
- **Android toolchain installed on this Mac** (was absent): openjdk@21 + Android
  command-line tools (SDK at `/opt/homebrew/share/android-commandlinetools`),
  platform-tools, platforms;android-36, build-tools;36.0.0, emulator +
  `system-images;android-36;google_apis;arm64-v8a`, AVD named `mq_pixel`. To build:
  `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
  + `export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`, then
  `cd android && ./gradlew assembleDebug`. Rob may want Android Studio later for
  interactive device testing + Play submission.
- **Git:** on branch **`android-spike`** (based on current `main` = the shipped
  v1.4/131). `android/` is **gitignored** (1.6 GB w/ build outputs; regenerable via
  `npm i && npx cap add android && npm run cap:sync`), matching the iOS convention.
  Committed: `@capacitor/android` dep in package.json, the plan doc, this handoff.
- **Prior "Android shelved" decision (2026-05-25) is now REACTIVATED** — the
  calculus changed (app feature-frozen → low sync cost; festival daily-update use
  case). Memory updated.

## 2026-07-06 update — v1.4 (131) submitted to App Store → APPROVED & LIVE (2026-07-07)

- **✅ RESOLVED: v1.4 (131) was APPROVED by Apple and auto-released — now LIVE in
  the public App Store**, confirmed by the SHINE team. It is the current production
  version, superseding 1.3/128.
- **v1.4 (build 131) SUBMITTED for App Store review** — state `WAITING_FOR_REVIEW`,
  releaseType `AFTER_APPROVAL` (auto-releases to all users on approval, ~24–48h).
  Review submission id `9c0099d1-1be0-49f5-92e0-f9e40115042f`. This puts the SHINE
  book card feature (with the real LGL buy link + "To order your SHINE mural book"
  CTA) into the public App Store, superseding the live 1.3/128.
  - Done via `assets/wip/mq_submit.py --submit` (updated from 1.3/128 → 1.4/131,
    new "What's New" copy about The Official SHINE Book). Export compliance was
    automatic (`ITSAppUsesNonExemptEncryption = false` in Info.plist). Screenshots
    carried over from 1.3 (9 shots). ASC version id `39a4959c-7fc1-4049-8795-b6b7de67e3a9`.
  - **"What's New" published:** "The Official SHINE Book is here. Celebrate ten
    years of the SHINE Mural Festival with 'SHINE: A Decade of Murals'… Filter
    Explore by SHINE to preview the book and order your copy. Plus minor fixes
    and refinements."
- **⚠ STILL TODO — merge `shine-book-card` → main.** The submitted code lives on
  branch `shine-book-card` (commits `3855d4d`, `11b7b85`), LOCAL only. `main` is
  still the 1.3 baseline. Merge it so main reflects what's now shipping. (The ASC
  submission is independent of git — the merge is repo hygiene, not a blocker.)
- SPAA TestFlight (131) is moot for the public path now — 1.4 is going to the App
  Store directly. If SPAA still wants a TestFlight preview, 131 is uploaded and can
  be added to the SPAA group + submitted for Beta App Review.

## (superseded) book card copy/link finalized + v1.4 (131) on TestFlight

- **CURRENT BUILD = v1.4 (131).** Supersedes 130. Two builds went up this session:
  - **130** — book-card copy fix + real LGL buy link. Commit `3855d4d`.
  - **131** — CTA text changed from "Take SHINE Home" to **"To order your SHINE
    mural book"** on BOTH the Explore banner (`bb-cta`) and the book detail buy
    button (`bd-buy`). Commit `11b7b85`. Verified rendering via headless Chrome
    (banner fits one line, no clip). **Use 131 for the Kent/Paul screenshots** —
    130 still has the old "Take SHINE Home" wording.
- **SHINE book card copy + real buy link shipped as v1.4 (TestFlight).**
  Uploaded to App Store Connect and confirmed "Upload succeeded / EXPORT
  SUCCEEDED / DONE." NOT submitted to the App Store (TestFlight only).
  - **Copy change:** book detail paragraph 1 now says "premium **hardcover
    coffee table book**, documenting…" and "St. Petersburg, Florida**,** into a
    global destination…". Everything else (eyebrow, title, para 2 about 250
    pages, CTA, SPAA credit) was already correct.
  - **Real buy link:** `SHINE_BOOK_URL` in `js/app.js` now points at the LGL
    order form → `https://secure.lglforms.com/form_engine/s/zEZNdCmYxuxJxx8CFzRmpg`
    (was the `https://muralquest.app` placeholder). Drives the "Take SHINE Home"
    button on the book detail page.
  - Verified rendering before build via headless Chrome (extension wasn't
    connected) — cover, copy, teal CTA, SPAA credit all render correctly.
  - **Committed** `js/app.js` on branch `shine-book-card` as `3855d4d`. Branch is
    LOCAL only (not pushed); `main` still the clean 1.3 baseline.
- **Build bumps 129 → 130 → 131.** Each bump = `CFBundleVersion` (Info.plist) +
  `CURRENT_PROJECT_VERSION` (×2 in project.pbxproj) + the scratch paths in
  `mq_build.sh`. Note `ios/` is entirely **gitignored**, so the native version
  bump lives only locally — the mq_build.sh dirty-guard only covers web assets.
  Built with `MQ_ALLOW_DIRTY=1` because untracked `assets/wip` artifacts (mockups,
  logos) trip the guard but are bundle-excluded (`cap:copy` excludes `assets/wip`).
- **⏳ NEXT STEPS (Rob's manual, in ASC once 131 finishes processing):**
  1. Rob is taking **screenshots of 131 for Kent + Paul (SPAA) to approve.**
  2. After their OK: TestFlight → **SPAA** external group → **Builds** → add
     **1.4 (131)** → **Submit for Beta App Review** and LET IT RUN to approval
     (don't stop it — stopping is what broke Kent's access on 129; see below).
  3. Then "submit for the next build" per Rob — i.e. that's the go-ahead to push
     the following build once SPAA signs off.
  - Likely an Apple **export-compliance** email for 130 → answer encryption =
    **No** (exempt).
- **App Store live is still v1.3 / build 128.** Book feature is TestFlight-only
  until `shine-book-card` is merged to main + `mq_submit.py --submit` is run.
  Confirmed with Rob: ASC TestFlight list showing "1.3 / 129" earlier was just the
  1.4 build (129) in the build list — no version mismatch.

### TestFlight external-testing gotcha (learned this cycle)

External groups (SPAA) can only install a build **after it passes Apple's Beta App
Review.** A freshly uploaded build shows "Ready to Submit" and external testers
see "No Builds Available" / "This beta isn't accepting any new testers right now"
until it's submitted AND approved. Rob accidentally **stopped** the 129 review,
which is what blocked tester Kent Lynn (`kwlynn@verizon.net`). Fix = re-submit via
the SPAA group's Builds tab (or remove+re-add the group to the build to force the
submit prompt). Internal testers skip Beta App Review; that's why Rob's own phone
got 129 immediately. Decided NOT to automate Beta App Review submission into
`mq_submit.py` — no further TestFlights expected right now, manual click is fine.

### SPAA logo deliverables (this session)

Made "Mural Quest" wordmark logos for the SPAA website (pelican mark + title-case
"Mural Quest" in **Quicksand 600**). Sent to SPAA; copies on Rob's Desktop as
`MuralQuest-Logo-White.png` and `MuralQuest-Logo-Transparent.png` (both 1146×960,
for light backgrounds). Masters + intermediates live in
`assets/wip/icon-variants/` (`mural-quest-logo-white.png` / `-transparent.png`,
plus `titlecase-500/600/700.png` and preview HTMLs). The transparent version has
the pelican's white background properly knocked out (corner flood-fill, interior
whites preserved). Font is **Quicksand** (`assets/wip/fonts/Quicksand-{500,600,
700}.ttf`) — the brand wordmark font. Note: title-case "Mural Quest" is a NEW
treatment; the four older `mq-icon-*` variants are lowercase or all-caps only.

### Live mural count

**189 live murals** in the app (202 YAMLs − 11 `status: research` − 1
`status: painted-over` − 1 template). Rob is standardizing marketing copy on
**"185+"** (safe round-down). Older "175+" still appears in the marketing-site
hero eyebrow and the promo video caption if he wants those updated to match.

## 2026-06-26 update — SHINE book card + v1.4 on TestFlight

- **SHINE book feature shipped to TestFlight as v1.4 (build 129).** Upload
  succeeded; in Apple processing at handoff time (appears for internal testers
  ~5–15 min after). Did NOT run `mq_submit.py` — TestFlight only, no App Store
  submission.
- **What the feature does:** "The Official SHINE Book" banner at the top of the
  Explore list, shown **only when the SHINE filter is active**, scrolling away
  naturally with the grid. Tapping it opens a book detail page (reuses the
  existing detail overlay + back button) with the SHINE cover, copy, SPAA
  credit, and a **"Take SHINE Home"** buy button.
  - Buy button → `https://muralquest.app` **(placeholder)**. `SHINE_BOOK_URL`
    in `js/app.js` — one-line swap once SPAA gives the real store/pre-order link.
  - Code: `renderExplore()` injects `.book-banner`; `openBookDetail()` +
    `buildBookDetailHTML()` near the detail-back handler in `js/app.js`; styles
    appended to `css/app.css`; cover bundled at `images/shine-book-cover.jpg`.
- **On branch `shine-book-card`** (commit `757b3d6`). LOCAL only — not pushed.
  `main` left clean (it's the v1.3-in-review/approved baseline). Merge to main +
  re-run `mq_submit.py` when ready to put the book feature in the App Store.
- **⚠ v1.3 is now APPROVED/released, not "waiting for review."** Apple closed
  the 1.3 train (`train version '1.3' is closed for new build submissions`),
  which forced the bump to 1.4. The 2026-06-16 note below is stale on this.
- **Bundle-hygiene fix:** `cap:copy` in `package.json` now excludes
  `assets/wip`. Previously the rsync copied the whole repo root into `www/` →
  iOS bundle, so ~10MB of book-card mockups AND the credential-carrying
  `assets/wip/mq_build.sh` were shipping inside the app. Now excluded. (Stale
  `www/assets/wip` + `ios/App/App/public/assets/wip` were removed before sync.)
- **Demo artifact:** `assets/wip/book-card/mockup-demo.html` — self-contained,
  single-file clickable prototype (inlined CSS + base64 images) used to iterate
  the design with Rob before building. Openable on any phone via AirDrop/email.
- **TestFlight install note:** installing 1.4 (129) via the TestFlight link
  REPLACES the App Store version on that device (same bundle id
  `com.muralquest.stpete`; iOS allows one install). Expected behavior — affects
  only devices that opt into TestFlight, NOT the public App Store listing (still
  1.3/128). Data carries over (129 > 128 = upgrade-in-place). Test build shows
  an orange dot and expires in 90 days. To restore production: delete the app,
  reinstall from the App Store. Rob installed 129 on his phone and confirmed the
  swap.

## 2026-06-26 update — Netlify retirement

- **Web PWA retired from Netlify** (native iOS app is the product now).
  - `shinepwa.netlify.app` and `legendary-bonbon-a5b20a.netlify.app` now
    301-redirect to muralquest.app (deployed a tiny `_redirects` placeholder).
    Site records kept — NOT deleted, so the PWA can be redeployed anytime via
    `netlify deploy --prod`.
  - `legendary-bonbon` was auto-deploying from the `shine-pwa` GitHub repo;
    set `stop_builds: true` so a future `git push` won't resurrect it. The repo
    link still exists (paused, not severed). `shinepwa` had no repo link
    (manual deploys only).
  - Deleted the dead duplicate `transcendent-truffle-be5840` (was already 404,
    also linked to the shine-pwa repo).
  - `muralquest.app` (marketing site) left untouched and live.

## 2026-06-16 update

- **v1.3 / build 128 submitted to App Store review** (state WAITING_FOR_REVIEW),
  auto-release on approval. Rob checks ASC daily; no monitoring needed.
- **Git working tree is now COMMITTED + PUSHED** (`3ec8086`) — supersedes the
  June 5 note below about the tree being "dirty but pre-existing." First commit
  since Apr 7; ~2 months of work (70 new murals, images, routes) now in history
  on the public GitHub `robmasselin-stpete/shine-pwa`.
- Build env + signing were fixed headlessly (CoreSimulator/platform install;
  created the account's first Apple Distribution cert + App Store profile).
  Build flow now wrapped in `assets/wip/mq_build.sh` (gitignored) with an
  uncommitted-work guard. Full detail: memory `project_v13_submission_staged.md`.
- Ads are now live in the **downtown guide**; observing v1.3 + ads for ~1 month.

## 2026-06-05 update

### How to resume

For the **app** (shine-pwa): `cd ~/shine-pwa && claude`, then "Read HANDOFF.md."
For the **marketing site** (muralquest.app): `cd ~/muralquest-website && claude`, then point at this file: "Read ~/shine-pwa/HANDOFF.md."

`~/shine-pwa/CLAUDE.md` auto-loads in the app dir. The auto-memory (always loaded) now includes pointers to the corrected marketing-site path and the "mockups are to-scale" feedback rule, so a fresh session won't re-discover those.

### Marketing site (muralquest.app) — shipped today, live

Full hero redesign deployed at https://muralquest.app:
- Replaced the Poseidon full-bleed photo with a **cream split layout**: headline left (ink, brick accents preserved: *can / can't / front*), three app screenshots fanned right (`app-map` → `app-explore` → `app-tours`, native 1179×2556 aspect ratio enforced via `aspect-ratio: 1179/2556`).
- Eyebrow `St. Petersburg, Florida · 175+ murals · 128 artists` is **full-width on top**, `white-space: nowrap`, 11px to match the `.section-eyebrow` below.
- Phones are **top-anchored** (`align-items: flex-start`, `transform-origin: top center`) so they never clip when the window narrows.
- Stats row holds 4-up at every width — both number (`clamp(28px, 4.4vw, 64px)`) and label (`clamp(9px, 1.05vw, 16px)`) scale with window width; 2×2 collapse rules at 1024px and 640px removed.
- Artist cards stay side-by-side down to 640px (was collapsing at 1024px). Map iframe reverted to the original `ensureSized` behavior (don't re-introduce `fitBounds` unless explicitly asked).
- Source files: `/Users/robasselin/muralquest-website/index.html`, `map.html`, `js/`, `images/app-*.jpeg`. **NOT a git repo** — reverts are by hand or via Netlify deploy history.
- Deploy: `cd ~/muralquest-website && netlify deploy --prod --dir . --site d3f1178c-10b7-4d75-92eb-da83096a7fee`
- Stale sibling at `/Users/robasselin/muralquest/` (Apr 27) — do NOT edit or deploy from it.

### Open / parked threads (no commitments)

1. **Mobile vs. desktop refinement** — Rob's call: "looks good for now, need to think about it." The hero body collapses to stacked at ≤760px, artists at ≤640px, stats stay 4-up via clamp. The decision left is whether the phone fan should shrink-and-stay or drop below the headline on small screens.
2. **SPAA mural titles** — parsed all 199 SPAA directory entries against the local YAMLs and produced an approval table grouped by ADD / CHANGE / SAME / NEEDS-MANUAL. **Nothing applied to YAMLs.** Rob hasn't said go. SPAA's `/find-arts/shine-mural-festival/` requires clicking "Load all"; the raw paste was in chat. ⚠ Flag two SPAA typos to NOT import: "Exsistence is Absurd" (LOOK the Weird #135) and "Estatic Rhythm" (Taylor White #180).
3. **Narrated routes / ElevenLabs voice clone** — Rob said he'd record a 60-sec voice sample for Instant Voice Clone. Status unknown. Scripts (opener + Donnelly snippet, rewritten for ElevenLabs natural pacing) preserved in the older handoff section below.
4. **Icon variant pick** — 4 variants saved at `~/shine-pwa/assets/wip/icon-variants/` (A/B/C/D). Rob hasn't picked.
5. **Recover {from, to, path} segments for 5 other routes** — downtown-north and the-edge have them; arts-district, central-ave, methodist-town, tropicana-field, chna-bike are flat-format only after a build-routes.py mishap. Per-leg navigation silently no-ops on those routes. Fix is to re-export from `tools/route-editor.html`.

### What's at risk on this reboot

- **/tmp is essentially empty already** — the SPAA raw file from this session was cleaned up; original paste is in chat history if needed.
- All marketing-site source is in `~/muralquest-website/` (durable) and live on Netlify (durable).
- shine-pwa's git working tree is dirty but pre-existing (none of today's work touched the app).
- Memory entries are under `~/.claude/projects/-Users-robasselin/memory/` — durable.

Nothing else to do before reboot. Close cleanly.

---

# Historical handoff (2026-05-26)

## How to resume (legacy notes)

In the new Claude Code session:

```
cd ~/shine-pwa
claude
```

Then say: **"Read HANDOFF.md and pick up where we left off."** The `~/shine-pwa/CLAUDE.md` will already auto-load with the project workflow rules.

---

## What was done this session (committed to disk, survives reboot)

### Mural 154 — Justin Bass / Tru
- Rewrote `artistBio`, `searchBio`, `muralInspiration` around the 1914 Benoist flight (Tony Jannus, Mayor Pheil, $400 auction seat). Research URLs logged in `sourceNotes`.
- Reclassified all three birds as flamingos (was pelican/flamingo/pelican). Renamed file `154-justin-bass-commercial.yaml` → `154-justin-bass.yaml`, updated `_index.json`.
- Edited the searchBio line "*The boombox the flamingo carries is the 112-year update — same route, different soundtrack*" → "*The flamingo is the 112-year update — same route, different vibe.*"
- `js/data.js` regenerated.

### Downtown North route updates
- Mural 129 (John Vitale) lat/lng → 27.771668 / -82.642127
- `ROUTE_DEFS` reorder in `js/app.js:1787` and `scripts/build-routes-osrm.py`: ids now `[6, 116, 23, 30, 1, 66, 129, 109, 110, 7, 9, 111, 115, 73, 24]`
- `js/routes.js` `downtown-north` segments replaced with the new path payload (15 segments, distance 2.13). The other 6 routes' segments got rebuilt by build-routes.py during a misstep (see below) — they still render fine but lost `{from, to, path}` labels for per-leg navigation.
- `data/routes/downtown-north.geojson` rebuilt to match the new ordering.

### New durable artifacts
- **`~/shine-pwa/CLAUDE.md`** — repo-level guide for Claude Code: covers the two editor PWAs (`tools/yaml-editor.html`, `tools/route-editor.html`), how to apply their pastes, and the routes.js format gotcha.
- **Memory entry** `feedback_route_editor_is_source.md` — hard rule: never run `scripts/build-routes.py` to regenerate `js/routes.js` (it emits the deprecated flat format and breaks per-leg nav). Route-editor PWA is the source of truth.
- **Memory entry** `project_mural_quest_android_shelved.md` — Android port shelved 2026-05-25; ~15-20% audience gain not worth 2x maintenance. Do not re-litigate unless the calculus changes.

### Final video
- `~/Desktop/ScreenRecording_titled.mp4` — 16.5s, 590×1280 portrait, three Quicksand 700 black-text titles (no box) timed 2-6 / 7-11 / 12-16, with 0.4s fade in/out. Built with ffmpeg + PIL-rendered title PNGs. Source: `~/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov`.

---

## Pending decisions / open threads

### 1. App icon wordmark — pick a variant
Four versions live at **`~/shine-pwa/assets/wip/icon-variants/`** (already saved off /tmp before reboot). Pelican mark from `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (cropped to artwork bounds) with "mural quest" wordmark in Quicksand below.

- `mq-icon-A-lowercase-500.png` — `mural quest`, weight 500 (lightest)
- `mq-icon-B-lowercase-600.png` — `mural quest`, weight 600 *(my pick for marketing/social)*
- `mq-icon-C-uppercase-700-spaced.png` — `MURAL QUEST`, weight 700, letter-spaced *(my pick for poster/wordmark feel)*
- `mq-icon-D-uppercase-600-spaced.png` — `MURAL QUEST`, weight 600, letter-spaced

**Decision needed:** which variant becomes the master? Also possible follow-ups: different bg color (sandy off-white / pelican teal), wider hero ratio (3:1), square 1200×1200 social profile, optional "St. Petersburg, FL" subline.

To regenerate variants, the Quicksand TTFs are at `~/shine-pwa/assets/wip/fonts/`. The PIL composition logic is documented below.

### 2. Video — should the black text get a subtle drop shadow or thin outline?
Black text with no box will be hard to read whenever the underlying screen recording goes dark. Two no-box-feel fixes pending your call:
- Single soft drop shadow
- Thin white outline stroke on the letterforms
- Or leave pure black

### 3. Narrated routes — voice cloning
You confirmed you'd try ElevenLabs **Instant Voice Clone** with your own voice ("deep, resonant, logical, clear — radio voice"). The recording script you'd read is in this doc below. Status: not yet recorded.

After cloning:
1. Validate with the one-sentence test from the chat: "*Your first stop is twenty feet in front of you. Derek Donnelly. St. Pete native, graphic designer.*"
2. If it sounds like you → render the rewritten opener and Donnelly snippet (text below) and listen back-to-back.
3. If yes → scale to the rest of downtown-north (~14 more snippets), then other 6 routes.

### 4. Other routes lost `{from, to, path}` segments
During this session, an accidental `build-routes.py` run wiped the `{from, to, path}` segment labels for 5 of 7 routes (arts-district, central-ave, methodist-town, tropicana-field, chna-bike). The route LINES still render on the map via the `s.path || s` fallback in `app.js:1181`, but per-leg navigation (the `find(s => s.from === fromId && s.to === toId)` lookup at app.js:2211 and 3684) returns nothing for those routes.

**To recover:** open `tools/route-editor.html`, load each affected route, re-export the Path Changes payload, paste here. New rule (now in memory): never run build-routes.py again.

---

## Reference: route-editor and yaml-editor workflow

Both are PWAs in `~/shine-pwa/tools/`. Source of truth for routes and YAMLs respectively.

When you paste their export blocks:
- **YAML editor** export starts with `# ═══ Modified YAML Files ═══`. Apply each YAML block verbatim to `data/murals/{id}-{slug}.yaml`. Update `_index.json` if a filename changed. Run `python3 scripts/build-data.py`.
- **Route editor** export has three sections (`GPS Position Updates`, `Route Definition`, `Path Changes`). GPS updates go into mural YAMLs. Route Definition goes into `ROUTE_DEFS` in `js/app.js:1785` AND `scripts/build-routes-osrm.py`. Path Changes goes into `js/routes.js` — Python-splice only the named route, do NOT run build-routes.py.

Full detail in `CLAUDE.md`.

---

## Reference: narrated route scripts (rewritten for ElevenLabs natural pacing)

### Voice clone — recording script (read this, not the narration scripts, to clone your voice)

> This is going to sound like a test, because it is. I'm recording this so a computer has enough of my voice to figure out how I talk. I live in St. Petersburg, Florida, and I've been here long enough to remember when most of these walls were blank. The murals you're about to walk past were painted between 2015 and 2025, mostly during a festival called SHINE. Some of them are by famous artists. Some are by people who paint here every weekend and have day jobs as electricians. A few are by both. Take your time. The walking part is half of it.

Recording tips: small carpeted space (closet with clothes is the classic), phone 6-8" from mouth slightly off-axis, Voice Memos at Lossless quality, mid-day energy.

### ElevenLabs settings for the cloned voice
- Stability: 35
- Similarity: 80
- Style exaggeration: 25
- Speaker boost: on
- Speed: 1.1
- Model: Eleven Multilingual v2 (or v3 if available)

### Downtown North — opener (~88 sec)

> You're standing in the 600 block of Central Avenue, and this is where SHINE started. In 2015, the St. Petersburg Arts Alliance, they go by spa, picked a name for the festival, raised some money, and invited a dozen artists to paint these walls. They thought it might run for a year, maybe two. It's been ten.
>
> What you're about to walk is the original. Fifteen murals between this corner and the waterfront. Most are by SHINE artists, some are by the people who organize SHINE, and a few predate the festival entirely. "Pre-SHINE," the artists call them, because nobody knew what to call it before there was a name.
>
> Your first stop is twenty feet in front of you. Derek Donnelly. St. Pete native, graphic designer. He opened a gallery called Saint Paint on this same block in 2011, a launchpad for half the artists you're about to see. The piece you're walking toward is his. Start walking, I'll find you at the wall.

### Mural 6 — Derek Donnelly, "Greetings from Hollander Hotel" (~70 sec)

> This is "Greetings from Hollander Hotel," a vintage postcard blown up onto a wall. The kid on the pelican is Donnelly's son. His name is Syre, and you'll see him in other Donnelly murals across the city. The pelican is the city's bird. The bridge in the distance is the Sunshine Skyway. Donnelly's own description: "a celebration of all things local, with my son and our city's bird."
>
> Donnelly has painted in St. Pete for ten years. For SHINE 2025, he ran the whole festival. Booked the artists, coordinated the walls, kept the schedule. This is one of two pieces he painted that year, and it's the first time he'd ever been featured as a SHINE artist after a decade of organizing it.
>
> Take a minute. The next wall is right here, same building, north face. Chad Mize is your next stop. I'll find you.

**Pronunciation to verify before rendering Syre:** "SIGH-er" (rhymes with *fire*) or "SEER" (one syllable)? Update the script with the spelling, or use the ElevenLabs Pronunciation Dictionary.

---

## Reference: video composition technique (in case we want to re-render)

Source video: `~/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov` (16.5s, 590×1280 portrait, 60fps)

### Title PNG generation (PIL)

```python
from PIL import Image, ImageDraw, ImageFont
FONT = ImageFont.truetype('/Users/robasselin/shine-pwa/assets/wip/fonts/Quicksand-700.ttf', 72)
W, H = 590, 1280
Y_CENTER = int(H * 0.22)
# Black text, no backplate, two lines centered, line_spacing=18
# Render each line at (W-line_width)/2, y starting at Y_CENTER
# Save as transparent PNG
```

Title texts (each on two lines):
1. "St. Pete has" / "175+ murals."
2. "Good luck finding" / "them all."
3. "So I mapped" / "every one."

### ffmpeg composition

```bash
IN="$HOME/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov"
OUT="$HOME/Desktop/ScreenRecording_titled.mp4"
ffmpeg -y -i "$IN" \
  -loop 1 -t 4.0 -i title1.png \
  -loop 1 -t 4.0 -i title2.png \
  -loop 1 -t 4.0 -i title3.png \
  -filter_complex "\
[1:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=3.6:d=0.4:alpha=1[t1];\
[2:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=3.6:d=0.4:alpha=1[t2];\
[3:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=3.6:d=0.4:alpha=1[t3];\
[0:v][t1]overlay=enable='between(t,2,6)'[v1];\
[v1][t2]overlay=enable='between(t,7,11)'[v2];\
[v2][t3]overlay=enable='between(t,12,16)'[outv]" \
  -map "[outv]" -map 0:a -c:a copy -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$OUT"
```

**Note:** Homebrew's default ffmpeg lacks the `drawtext` filter (no libfreetype). The PIL → PNG → overlay pattern is the workaround. Don't try ffmpeg's `drawtext` without first installing `homebrew-ffmpeg/ffmpeg/ffmpeg` from the full tap.

### Social caption (paste under the video on IG/TikTok)

> St. Petersburg has over 175 murals hiding in plain sight. I spent two months photographing and pinning every one I could find, so you can see exactly where they are — and how many you've walked right past. This is the map. 📍
>
> Mural Quest. St. Pete's street art, in your pocket.
>
> #StPete #StPeteArt #MuralQuest #SHINEStPete #StreetArt #DTSP

(App actually contains 186 murals per current build. "175+" rounds down for the headline. If you want to bump to "186" in the on-screen title, ask and I'll re-render.)

---

## Where things live after reboot

| Thing | Path |
|---|---|
| This handoff | `~/shine-pwa/HANDOFF.md` |
| Repo CLAUDE.md (auto-loads in Claude Code) | `~/shine-pwa/CLAUDE.md` |
| Auto-memory (always loaded) | `~/.claude/projects/-Users-robasselin/memory/MEMORY.md` |
| Icon variants | `~/shine-pwa/assets/wip/icon-variants/` |
| Quicksand fonts | `~/shine-pwa/assets/wip/fonts/` |
| Title PNGs + source text files | `~/shine-pwa/assets/wip/video-titles/` |
| Final titled video | `~/Desktop/ScreenRecording_titled.mp4` |
| Source screen recording | `~/Desktop/ScreenRecording_05-26-2026 15-59-00_1.mov` |
| Mural Quest icon source | `~/shine-pwa/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |

`/tmp/mq-icon/` and `/tmp/mq-video/` will be wiped on reboot. Everything important has been copied to `~/shine-pwa/assets/wip/`.

---

## First thing to do in the next session

Tell Claude which thread to resume:
- *"Pick the icon variant — I want B"* (or A/C/D)
- *"Add a thin white outline to the video titles"*
- *"I recorded my voice clone — here's the file at ~/Desktop/clone.m4a"*
- *"Recover the from/to segments for the other 5 routes"*
- Something else entirely

Each thread is self-contained from here.
