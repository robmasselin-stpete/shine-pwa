# Mural Quest — Backup & Recovery

The goal: never lose the ability to **rebuild and ship** either app. Code is easy
(git). The dangerous part is a handful of **signing keys that live only on this Mac** —
lose those and you can be locked out of updating a shipped app. Follow the 3-2-1 rule:
**3 copies, 2 kinds of media, 1 off-site.**

## 1. Code → GitHub (primary, off-machine) ✅
- Repo: `git@github.com:robmasselin-stpete/shine-pwa.git` (private), working branch **v1.5**.
- **Push after every session.** Tag every release.
- Recovery points are git **tags**, e.g. `submitted-2026-08-14` (iOS 1.6/151 + Android 1.7/v12 submitted).
- A clone gets you the code — but you still need the vault below (#2) to actually build/ship.

## 2. The crown jewels → encrypted vault (NOT in git) ⚠️
These are gitignored or outside the repo. Some are **unrecoverable** if lost. Keep them
in an **encrypted** store (password manager, or an encrypted DMG — see below), **off-machine**:

| Item | Path | If lost |
|---|---|---|
| **Android upload keystore** | `android/keystore/mural-quest-upload.jks` | Play App Signing means Google holds the real key → you can request an **upload-key reset** from Google (slow, but recoverable). |
| **Keystore passwords** | `android/keystore.properties` | In the keystore; back up together. |
| **ASC API key** | `~/.appstoreconnect/AuthKey_FRBV835469.p8` (Key ID `FRBV835469` + Issuer ID) | Apple lets you download a `.p8` **only once** → revoke + generate a new one in App Store Connect. |
| **iOS signing cert + private key** | "Apple Distribution" in **Keychain Access** | Revoke + regenerate in ASC (this cert was created via the ASC API — see MEMORY.md). Export it now as `.p12` (steps below). |
| **Build/ship scripts** | `assets/wip/mq_build.sh`, `mq_submit.py`, `ExportOptions-manual.plist` | Carry ASC account IDs; rewrite from MEMORY.md if lost. |
| **Service API keys** | `.mq-anthropic-key`, `.mq-elevenlabs-key`, `.mq-ig-post-key` | Regenerable from each service. |
| **iOS native project** | whole `ios/` dir (gitignored) | `native-ref/AppDelegate.swift` (tracked) backs up the native plugins (MQStore + AppRating). The rest regenerates via `npx cap add ios`; then reapply AppDelegate from native-ref + the Info.plist edits (no background modes, When-In-Use only). |

## 3. Whole-machine safety net → Time Machine
A **Time Machine** backup to an external drive captures *everything* at once — the full
`~/shine-pwa` (including gitignored files), the login Keychain (signing cert), and
`~/.appstoreconnect`. This is the simplest complete recovery. Turn it on if it isn't.

## When to back up
- **Git push + tag** after every release and every working session.
- **Refresh the vault** only when a key/keystore/cert changes (rare).
- **Time Machine** runs automatically.

## Recovery playbook (new Mac / disaster)
1. `git clone` the repo, `git checkout <release tag>`.
2. Restore from the vault: keystore + `keystore.properties` → `android/keystore/`;
   `.p8` → `~/.appstoreconnect/`; build scripts → `assets/wip/`; `.mq-*` keys → repo root.
3. iOS: import the `.p12` (cert + key) into Keychain. If `ios/` is missing: `npx cap add ios`,
   then reapply `AppDelegate.swift` from `native-ref/` and the Info.plist edits.
4. `npm install` → `npm run cap:sync`.
5. Build — Android: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 android/gradlew -p android bundleRelease`.
   iOS: `bash assets/wip/mq_build.sh`.

## Current live state (2026-08-14)
- **iOS** v1.6 build **151** — in App Store review (2.5.4/2.3.2 fixes).
- **Android** v1.7 versionCode **12** — in Play production review (subscription, icon, Billing 8.0.0).
- **Grandfather cutoff** `2026-08-22` (`js/subscription.js`); flip iOS Paid→Free + release on/before **Aug 21**.
- **Signing:** Android = Play App Signing (Google holds key) + local upload key. iOS = manual signing, Apple Distribution cert + `ExportOptions-manual.plist`.
- **Cloud infra (backed by their own configs in-repo):** OTA `content.json` → Cloudflare R2 (`cdn.muralquest.app`); analytics/IG/content Workers under `workers/`.
