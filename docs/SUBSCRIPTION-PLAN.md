# Mural Quest — Subscription Plan (auto-renewable $6.99/year)

Convert the app from **paid** ($6.99 one-time) to **free download + an
auto-renewable $6.99/year subscription** (Apple manages renewal/billing/cancel —
the low-maintenance choice for a passion project). Grandfather the ~35 existing
paid owners with a free year.

Implemented with **RevenueCat** (`@revenuecat/purchases-capacitor`), cross-platform
for iOS + Android.

## Decision history
Briefly considered non-renewing (manual) and one-time; landed on **auto-renewable**
because Apple runs it hands-off, it's not a "sneak charge" (Apple emails before
each renewal + one-tap cancel), and the app is updated yearly (new SHINE murals),
which justifies a yearly charge.

## Current state
- Paid app, $6.99 one-time, ~35 owners (own it forever).
- Flat price: **$6.99/year**, auto-renewable, no intro offer.
- Cross-platform: iOS live; Android in Play internal testing.

## Store setup (Rob's actions)

### App Store Connect — mostly done
1. ✅ Auto-renewable subscription **`mq_yearly`**, $6.99/year, in group "Mural Quest
   Access", localized. (Keep it — this is the correct product.)
2. ⬜ **Pricing and Availability → Paid → Free** — **only at ship time**, in the same
   release as the paywall build. (Flipping early = app free with no gate = lost revenue.)
3. ⬜ **Terms of Use (EULA) + Privacy Policy URLs** — required or Apple rejects. The
   paywall links to `muralquest.app/terms` and `/privacy` — these must be live.
4. ⬜ Subscription **review screenshot + notes** — added at submission.

### RevenueCat
1. Free account → create a Project → add the iOS app (bundle `com.muralquest.stpete`).
2. Connect App Store (App Store Connect API key) so RC can read purchases.
3. Add the product **`mq_yearly`**; create an **entitlement `access`** and attach
   `mq_yearly` to it; put `mq_yearly` in the **default Offering** as a package.
4. Grab the **public iOS SDK key** (`appl_…`) → paste into `js/subscription.js`.
5. (Android later: add the Play app + `mq_yearly` subscription.)

## Code — built
- `js/subscription.js` — RevenueCat layer via `window.Capacitor.Plugins.Purchases`
  (no bundler). Access = active `access` entitlement (live subscription OR a manual
  dashboard grant) OR a grandfathered legacy buyer.
- Paywall UI — `#paywall` in `index.html` + CSS. Copy: "$6.99/year, renews
  automatically, cancel anytime." Subscribe + Restore + Terms/Privacy links.
- Gate — `initAccessGate()` in `app.js`: on native, covers the app until access is
  confirmed; web stays open.
- Plugin synced into the iOS native project (SPM).

## Manual admin (the "give someone an extra year" ask)
The `access` entitlement doubles as the comp mechanism: from the RevenueCat
dashboard, grant/extend/revoke `access` for any customer, any duration — no build.
Caveat: buyers are anonymous (found by transaction/opaque id, not email) unless we
add an optional email step later.

## Grandfathering
Legacy paid buyers detected by `originalApplicationVersion` (CFBundleVersion at
original purchase) `< 145` (first subscription build). Free access until
`GRANDFATHER_UNTIL` (2027-08-31). Constants in `subscription.js`.

## Testing note
In StoreKit **sandbox**, `originalApplicationVersion` is often `"1.0"`, so a sandbox
tester looks grandfathered and skips the paywall. To test the real purchase flow,
temporarily raise/disable the grandfather check or use a sandbox account whose
original version is ≥ 145.

## Sequence
1. ✅ Stripe cleanup.
2. ✅ Code built (RevenueCat auto-renewable gate + paywall).
3. ⬜ Rob: RevenueCat account + `access` entitlement on `mq_yearly`; send me the `appl_…` key.
4. ⬜ Rob: get Terms + Privacy pages live.
5. ⬜ Claude: paste the key; build to TestFlight; sandbox-test subscribe + restore + grandfather.
6. ⬜ At ship: flip Paid → Free; submit `mq_yearly` with the app version.
7. ⬜ Android: Play subscription + RevenueCat Android app; test.
