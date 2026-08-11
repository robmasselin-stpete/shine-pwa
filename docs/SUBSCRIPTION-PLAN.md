# Mural Quest — Subscription Plan (native StoreKit, auto-renewable $6.99/year)

Convert the app from **paid** ($6.99 one-time) to **free download + an
auto-renewable $6.99/year subscription**, using **Apple's native StoreKit 2** — no
third party (RevenueCat was considered and torn out; Rob wants nothing extra to
run). Grandfather the ~35 existing paid owners with a free year.

## Why native StoreKit (no RevenueCat)
Rob's priority is minimal moving parts: "let Apple handle it, nothing extra to
babysit." StoreKit 2 verifies entitlements on-device with no server and no
third-party account/dashboard. The cost was more native code (written) and Android
becomes its own step later. Comps are done with **App Store Offer Codes** (generate
in ASC, hand out; they appear as an active entitlement).

## Current state
- Paid app, $6.99 one-time, ~35 owners (own it forever).
- Flat price: **$6.99/year**, auto-renewable, no intro offer.
- Cross-platform: iOS built here; Android in Play internal testing (ungated for now).

## Code — built
- **Native plugin `MQStore`** in `ios/App/App/AppDelegate.swift` (StoreKit 2):
  `getProduct` (price), `purchase`, `checkAccess` (active entitlement +
  `AppTransaction.originalAppVersion` for grandfathering), `restore` (`AppStore.sync`).
  A `Transaction.updates` listener finishes renewals/Offer-Code redemptions.
  **⚠️ `ios/` is gitignored** — a tracked backup lives in `native-ref/` (see its README).
- `js/subscription.js` — calls `MQStore` via `Capacitor.nativePromise`. Access =
  active `mq_yearly` entitlement OR grandfathered legacy buyer. Grandfather cutoff +
  window are JS constants (easy to tweak): build `< 145`, free until 2027-08-31.
- Paywall UI — `#paywall` in `index.html` + CSS. Copy: "$6.99/year, renews
  automatically, cancel anytime." Subscribe + Restore + Terms/Privacy links.
- Gate — `initAccessGate()` in `app.js`: on iOS, covers the app until access is
  confirmed; web + Android stay open.

## Store setup (Rob's actions) — much smaller now
### App Store Connect
1. ✅ Auto-renewable subscription **`mq_yearly`**, $6.99/year, localized. (Keep as-is.)
2. ⬜ **Terms of Use (EULA) + Privacy Policy URLs** — required or Apple rejects.
   Paywall links to `muralquest.app/terms` and `/privacy` — must be live.
3. ⬜ At **ship time only**: **Pricing → Paid → Free**, and submit `mq_yearly` +
   its review screenshot with the app version.
- **No RevenueCat account. No SDK keys.**

### Comps ("give someone a year")
Generate an **Offer Code** (or promo code) in ASC for `mq_yearly` → hand it out →
they redeem in the App Store → active entitlement → access. No dashboard needed.

### Google Play (later)
StoreKit is iOS-only, so Android is ungated until a Play Billing plugin is built.
When we do Android: native Play Billing (or a Capacitor billing plugin) + a Play
subscription `mq_yearly`.

## Grandfathering
Legacy paid buyers detected by `AppTransaction.originalAppVersion` (CFBundleVersion
at original purchase) `< 145`. Free access until 2027-08-31. Constants in `subscription.js`.

## Testing note
In StoreKit **sandbox**, `originalAppVersion` is often `"1.0"`, so a sandbox tester
looks grandfathered and skips the paywall. To test the real purchase flow,
temporarily raise/disable the grandfather check (or use a StoreKit config file /
a fresh sandbox account). Sandbox subscriptions renew on an accelerated clock.

## Sequence
1. ✅ Stripe cleanup.
2. ✅ Native StoreKit gate + paywall built; RevenueCat removed.
3. ⬜ Rob: get Terms + Privacy pages live.
4. ⬜ Claude: build to TestFlight; sandbox-test subscribe + restore + grandfather.
5. ⬜ At ship: flip Paid → Free; submit `mq_yearly` with the app version.
6. ⬜ Android: Play Billing + Play subscription; test.
