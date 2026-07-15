# Background Location — Store Review Notes (v1.5)

Background location is the single most-scrutinized thing you can add on both stores.
This is our justification + the disclosures/config we need so v1.5 clears review.

## Why the app needs it (the legitimate use case)

Mural Quest's **narrated walking tours** (ElevenLabs voice) guide the user between
murals with **audio triggered by proximity** — the phone is often **in a pocket,
screen off**, while the user walks and listens. That requires location updates while
backgrounded. Without it, narration can't fire as you approach the next wall.

This is a textbook "navigation / audio guide" case, which both stores allow — the
key is disclosing it clearly and using the least-privileged mechanism.

## Technical approach (review-friendly by design)

- **Foreground service** (`@capacitor-community/background-geolocation`,
  `foregroundServiceType=location`) with a **persistent notification** — location
  only flows while a tour is active and the notification is visible.
- **We do NOT request `ACCESS_BACKGROUND_LOCATION`** (Android's most-scrutinized
  permission). The foreground service covers our need; avoiding background-location
  keeps Google review much simpler.
- Background tracking **starts only when the user starts a tour** and **stops when
  the tour ends** — never at launch, never passively.

## Android (Google Play) checklist

- [ ] **Permissions declared** (mostly via the plugin's manifest merge):
  `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`. (NOT `ACCESS_BACKGROUND_LOCATION`.)
- [ ] **Foreground service type = location** declared (plugin does this).
- [ ] **Prominent in-app disclosure** BEFORE starting background tracking: a screen
  that says location is used in the background to guide the tour + play narration,
  with explicit user consent (start-tour = consent, but show the disclosure once).
- [ ] **Play Console → App content → declare foreground-service permissions use**
  and the **location** declaration.
- [ ] **Demo video** showing the disclosure + the feature (Google requires this for
  location-in-background-adjacent uses).
- [ ] Data safety form: location = collected, used for app functionality, not shared.

## iOS (App Store) checklist

- [x] `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription`
  set in Info.plist (clear, tour-specific wording).
- [x] `UIBackgroundModes = [location, audio]` (audio: narration plays backgrounded).
- [ ] **Review notes**: explain the narrated-tour use case + that background location
  only runs during an active, user-started tour with a visible indicator.
- [ ] Request **When-In-Use first**, escalate to Always only when a tour starts
  (don't ask for Always up front — Apple prefers progressive).
- [ ] Privacy nutrition label: Location → app functionality, not linked/tracked.

## App-side work still to do (integration, after S23 arrives)

- Wire `js/geo-background.js` `startBackgroundTour()`/`stopBackgroundTour()` into the
  tour start/stop flow (replaces/augments the foreground `navigator.geolocation`
  watcher for the active-tour case).
- Build the **prominent disclosure** screen shown before the first background tour.
- Tune `distanceFilter` + notification copy; test background survival on the **S23**
  (Samsung Device Care) and battery impact.
- Hook proximity → narration audio (the ElevenLabs delivery layer).

## ⚠ Config persistence note

`ios/` is gitignored, so the Info.plist keys above live only locally — if the iOS
project is ever regenerated, re-apply: the two `NSLocation…UsageDescription` strings
and `UIBackgroundModes = [location, audio]`. (Android manifest permissions come from
the plugin's manifest merge + the tracked app manifest, so those persist.)
