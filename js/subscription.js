// =============================================
// Access — native Apple StoreKit 2 (auto-renewable $6.99/year, `mq_yearly`)
// =============================================
// No third party. The native MQStore plugin (ios/App/App/AppDelegate.swift) talks
// to StoreKit 2 directly; Apple manages renewal/billing/cancel and verifies
// entitlements on-device. This JS layer just asks the plugin "is the subscription
// active?" and applies the grandfather rule for legacy paid buyers.
//
// Native plugins here are invoked via Capacitor.nativePromise (the app has no
// bundler and these hand-written CAPBridgedPlugins aren't on Capacitor.Plugins).
//
// Access = active `mq_yearly` entitlement (a live subscription, OR a free period
// from a redeemed Offer Code — that's how Rob comps someone a year) OR a
// grandfathered legacy buyer of the old PAID app.
//
// Android note: this native plugin is iOS-only. Until a Play Billing equivalent
// is built, subscriptionsSupported() is false on Android, so the Android build is
// ungated (it's still internal-testing only).

// Grandfathering: anyone who bought the app BEFORE it went free is a legacy buyer
// and gets access FREE FOR LIFE (no expiry). Detected by the original-purchase
// DATE (AppTransaction.originalPurchaseDate) — robust, no version-string ambiguity:
// an original purchase before the go-live moment = a legacy buyer.
// LAUNCH cutoff: original purchase before this = legacy buyer = free for life.
// Set ~2 weeks out so it lands AFTER we flip Paid→Free at release — guarantees no
// paying customer is ever excluded (the flip happens well before this). Any brand-
// new free download in the gap between release and this date is also grandfathered
// (negligible with no promotion).
const GRANDFATHER_PURCHASE_BEFORE = Date.parse('2026-08-25T00:00:00Z');

// ⚠️ TEST ONLY — shows an on-screen readout of the raw StoreKit original-purchase
// values + which path granted access, so grandfathering can be verified on-device
// (release builds aren't web-inspectable). Set false for production.
const DEBUG_ACCESS = false;

// -------------------------------------------------------------------------------
function cap() { return window.Capacitor || null; }
function callStore(method, args) { return cap().nativePromise('MQStore', method, args || {}); }

/** True only on the iOS app, where the native StoreKit plugin exists. */
export function subscriptionsSupported() {
  const c = cap();
  return !!(c && c.isNativePlatform && c.isNativePlatform()
    && typeof c.nativePromise === 'function'
    && c.getPlatform && c.getPlatform() === 'ios');
}

let _access = false;
let _expiryMs = 0;      // when access ends (0 = none / no expiry, incl. free-for-life)
let _reason = 'none';   // 'subscription' | 'grandfather' | 'undetermined' | 'none'
let _lastInfo = null;   // raw checkAccess payload (for the debug readout)
let _determined = false; // did the last checkAccess actually complete?

function computeAccess(info) {
  _expiryMs = 0;
  _reason = 'none';
  if (!info) return false;
  // 1) Active subscription (or a redeemed Offer Code period).
  if (info.active) { _expiryMs = info.expirationMs || 0; _reason = 'subscription'; return true; }
  // 2) Legacy buyer — original purchase before go-live = free for life (no expiry).
  //    ONLY in the real production environment: in Sandbox/TestFlight/App Review the
  //    original-purchase date is a fixed 2013 placeholder, which would wave the
  //    reviewer past the paywall (→ rejection). Forcing production-only means the
  //    reviewer always sees the paywall and can test subscribing, while real
  //    customers are grandfathered in production.
  if (String(info.environment).toLowerCase() === 'production') {
    const opd = info.originalPurchaseMs;
    if (opd && opd < GRANDFATHER_PURCHASE_BEFORE) { _expiryMs = 0; _reason = 'grandfather'; return true; }
  }
  return false;
}

/** First access check at launch. (StoreKit needs no configuration.) */
export async function initSubscription() {
  await refreshAccess();
}

/** Re-check the subscription/entitlement state. Returns the boolean. */
export async function refreshAccess() {
  if (!subscriptionsSupported()) { _determined = true; return _access; }
  try {
    const info = await callStore('checkAccess');
    _lastInfo = info;
    _access = computeAccess(info);
    _determined = true;
  } catch (e) {
    console.warn('[access] checkAccess failed', e);
    _determined = false; // couldn't reach StoreKit — the gate fails OPEN (never lock out a real buyer)
  }
  return _access;
}

export function hasAccess() { return _access; }
/** Epoch ms when access ends (0 if none / no expiry). */
export function accessExpiryMs() { return _expiryMs; }
/** False if the last check couldn't reach StoreKit — the gate should fail open. */
export function accessDetermined() { return _determined; }
/** Test-build readout: whether to show it + the raw values that drove the decision. */
export function accessDebug() {
  return {
    show: DEBUG_ACCESS,
    reason: _reason,
    access: _access,
    determined: _determined,
    active: _lastInfo ? _lastInfo.active : null,
    oav: _lastInfo ? _lastInfo.originalAppVersion : null,
    opdMs: _lastInfo ? _lastInfo.originalPurchaseMs : null,
    env: _lastInfo ? _lastInfo.environment : null,
  };
}

/** Localized price string for the paywall (e.g. "$6.99"). '' if unavailable. */
export async function getPriceString() {
  if (!subscriptionsSupported()) return '';
  try {
    const r = await callStore('getProduct');
    return (r && r.priceString) || '';
  } catch { return ''; }
}

/** Subscribe to the yearly plan. Resolves true if access is now granted.
 *  A user cancel resolves false; real errors reject (caller shows a message). */
export async function purchase() {
  if (!subscriptionsSupported()) return false;
  const r = await callStore('purchase');
  if (r && r.cancelled) return false;
  // On success the native side finishes the transaction; re-read the entitlement.
  await refreshAccess();
  return _access;
}

/** Restore a prior purchase (native does AppStore.sync, then re-checks). */
export async function restore() {
  if (!subscriptionsSupported()) return false;
  const info = await callStore('restore');
  _lastInfo = info;
  _access = computeAccess(info);
  return _access;
}
