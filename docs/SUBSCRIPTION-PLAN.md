# Mural Quest — Access Plan (non-renewing $6.99/year)

Convert the app from **paid** ($6.99 one-time) to **free download + a $6.99
NON-RENEWING one-year purchase** (manual renewal — it does NOT auto-renew; Rob's
explicit choice). Grandfather the ~35 existing paid owners with a free year.

Implemented with **RevenueCat** (`@revenuecat/purchases-capacitor`), cross-platform
for iOS + Android.

## Why non-renewing
Rob does not want auto-renew ("cheezy"). Apple's **non-renewing subscription** is a
first-class In-App Purchase type: buy a fixed year, no auto-charge, re-buy manually
when it lapses. Trade-off accepted: lower recurring revenue (people forget to
renew), and the app tracks the 1-year expiry itself (Apple doesn't).

## Current state
- Paid app, $6.99 one-time, ~35 owners (own it forever).
- Flat price: **$6.99 for one year**, non-renewing.
- Cross-platform: iOS live; Android in Play internal testing.

## Store setup (Rob's actions)

### App Store Connect
1. The auto-renewable `mq_yearly` we created earlier is the WRONG type now — **leave
   it unsubmitted or delete it.** (Product IDs can't be reused, hence the new id below.)
2. **In-App Purchases → create** a **Non-Renewing Subscription**:
   - Product ID: **`mq_year`** ← my code keys off this exactly.
   - Reference Name: `Mural Quest — 1 Year`
   - Price: **$6.99**
   - Localization: Display Name `Mural Quest`, description.
3. **Pricing and Availability → Paid → Free** — **only at ship time**, in the same
   release as the paywall build. (Flipping early makes the app free with no gate = lost revenue.)
4. **Terms of Use (EULA) + Privacy Policy URLs** — required or Apple rejects. The
   paywall links to `muralquest.app/terms` and `/privacy` — these must be live.

### Google Play
- Google Play has no "non-renewing" type. Closest is a **one-time product (INAPP)**
  `mq_year` at $6.99; the app enforces the 1-year window (same code path). Create it
  under Monetize → In-app products when we get to Android.

### RevenueCat
1. Free account → create a Project → add the iOS app (bundle `com.muralquest.stpete`).
2. Connect App Store (App Store Connect API key) so RevenueCat can read purchases.
3. Add the product **`mq_year`**; put it in the **default Offering** as a package.
4. (Android later: add the Play app + `mq_year` INAPP product.)
5. Grab the **public iOS SDK key** (`appl_…`) → paste into `js/subscription.js`.

## Code — built (this pass)
- `js/subscription.js` — RevenueCat layer: configure, price, purchase, restore,
  and access = *(non-renewing purchase within the last year)* OR *(grandfathered
  legacy buyer)*. Expiry computed from `nonSubscriptionTransactions` purchase date.
- Paywall UI — `#paywall` in `index.html` + CSS. Honest copy: "one year… does not
  auto-renew." Subscribe + Restore + Terms/Privacy links.
- Gate — `initAccessGate()` in `app.js`: on native, covers the app until access is
  confirmed; web stays open.
- Plugin synced into the iOS native project (SPM).

## Grandfathering
Legacy paid buyers detected by `originalApplicationVersion` (CFBundleVersion at
original purchase) `< 145` (first non-renewing build). They get free access until
`GRANDFATHER_UNTIL` (2027-08-31) — ~a year. Constants in `subscription.js`.

## Testing note
In StoreKit **sandbox**, `originalApplicationVersion` is often `"1.0"`, so a sandbox
tester looks grandfathered and skips the paywall. To test the actual purchase flow,
temporarily raise/disable the grandfather check or use a sandbox account whose
original version is ≥ 145.

## Sequence
1. ✅ Stripe cleanup.
2. ✅ Code built (RevenueCat non-renewing gate + paywall).
3. ⬜ Rob: create `mq_year` non-renewing IAP in ASC; make RevenueCat account; send me the `appl_…` key.
4. ⬜ Claude: paste the key; build to TestFlight; sandbox-test purchase + restore + grandfather.
5. ⬜ At ship: flip Paid → Free; submit the IAP with the app version; ensure EULA/Privacy live.
6. ⬜ Android: create Play product + RevenueCat Android app; test.
