# Mural Quest — Subscription Plan ($6.99/year)

Convert the app from **paid** ($6.99 one-time) to **free download + auto-renewable
subscription** ($6.99/year, no intro offer). Grandfather the ~35 existing paid
owners with a free year.

## Current state (Aug 2026)
- **Paid app**, $6.99 one-time in App Store Connect. ~35 owners (own it forever).
- **No purchase code** in the app — the old Stripe PWA gate is fully removed.
- Cross-platform: iOS live on the App Store, Android in Play internal testing.
- Flat pricing decided: **$6.99/year, everyone, no introductory offer.**
  (Apple can't make a first year *pricier* than renewal, so the earlier
  "$6.99 then $4.99" idea isn't possible; we settled on flat $6.99/yr.)

## Decision needed: purchase mechanism

| | **RevenueCat** (recommended) | **Native** (StoreKit 2 + Play Billing) |
|---|---|---|
| Cross-platform | One SDK for iOS + Android | Two separate integrations |
| Entitlements / restore | Handled by SDK + dashboard | Hand-rolled |
| Grandfathering | Exposes original purchase date | Read `AppTransaction` (iOS) / Play API |
| Receipt validation | Server-side, done for you | You build/host it |
| Cost | Free < $2.5k/mo revenue (we're ~$245/yr) | No fee |
| Downside | 3rd-party dep + account; purchase data flows through them | Much more code + edge cases to maintain |
| Capacitor plugin | `@revenuecat/purchases-capacitor` | community IAP plugins, less turnkey |

**Recommendation: RevenueCat.** For a solo operator shipping to both stores with
grandfathering, it removes the two riskiest chunks (receipt validation +
cross-store entitlement logic). We're far under the free tier.

## Store setup (Rob's actions — I can't do these)

### App Store Connect
1. **Pricing and Availability → change from Paid to Free.** Existing owners keep the app.
2. **Subscriptions →** create a subscription group (e.g. "Mural Quest Access") and an
   auto-renewable product, id `mq_yearly`, **$6.99/year**.
3. Add the required subscription **localization, display name, and review screenshot**.
4. Add **Terms of Use (EULA)** + **Privacy Policy** URLs (Apple rejects subs without these).

### Google Play
1. **Monetize → Subscriptions →** create `mq_yearly`, **$6.99/year**.
2. App is already free on Play.

## Code (I build, once products exist + mechanism chosen)
1. **Paywall screen** — repurpose the removed gate UI shell: features list,
   "Subscribe — $6.99/year", "Restore Purchases", Terms/Privacy links.
2. **Entitlement gate on launch** — `hasAccess()` returns true if the user has an
   active subscription OR is grandfathered; otherwise show the paywall.
3. **Purchase + restore flow** — via the chosen SDK.
4. **Grandfathering** — detect an original *paid* purchase that predates the
   subscription build (StoreKit `AppTransaction.originalAppVersion` /
   RevenueCat original-purchase date) and grant a **1-year** entitlement from the
   switch. (Could also make it permanent — only 35 people; Rob's call.)

## App Review notes
- Subscription paywalls must show price, period, and auto-renew terms, plus links
  to a functional EULA + Privacy Policy and a **Restore Purchases** button, or
  Apple rejects. Google is similar.
- Apple guideline: you **cannot** remove functionality existing paid users had
  without grandfathering them — which is exactly why step "Grandfathering" exists.

## Sequence
1. ✅ Stripe cleanup (commit 5f27716).
2. ⬜ Rob: choose RevenueCat vs native.
3. ⬜ Rob: create the `mq_yearly` products in ASC + Play; switch app to Free; add EULA/Privacy URLs.
4. ⬜ Claude: build paywall + entitlement gate + purchase/restore + grandfather.
5. ⬜ Test with sandbox purchases on TestFlight / Play internal.
6. ⬜ Submit (both stores scrutinize subscriptions harder than normal updates).
