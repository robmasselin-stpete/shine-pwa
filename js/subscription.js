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

// Grandfathering: iOS users who bought the paid app keep full access free until
// GRANDFATHER_UNTIL. Detected via CFBundleVersion at original purchase
// (AppTransaction.originalAppVersion): paid builds are < 145; the first
// subscription build (and every new install) is ≥ 145.
const SUBSCRIPTION_FIRST_BUILD = 145;
const GRANDFATHER_UNTIL = Date.parse('2027-08-31T23:59:59Z');

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
let _expiryMs = 0; // when access ends (subscription/grant expiry), 0 = none/unknown

function computeAccess(info) {
  _expiryMs = 0;
  if (!info) return false;
  // 1) Active subscription (or redeemed Offer Code period).
  if (info.active) { _expiryMs = info.expirationMs || 0; return true; }
  // 2) Grandfathered legacy paid buyer.
  const oav = info.originalAppVersion;
  const buildNum = oav ? parseInt(oav, 10) : NaN;
  if (!isNaN(buildNum) && buildNum < SUBSCRIPTION_FIRST_BUILD && Date.now() < GRANDFATHER_UNTIL) {
    _expiryMs = GRANDFATHER_UNTIL;
    return true;
  }
  return false;
}

/** First access check at launch. (StoreKit needs no configuration.) */
export async function initSubscription() {
  await refreshAccess();
}

/** Re-check the subscription/entitlement state. Returns the boolean. */
export async function refreshAccess() {
  if (!subscriptionsSupported()) return _access;
  try {
    const info = await callStore('checkAccess');
    _access = computeAccess(info);
  } catch (e) {
    console.warn('[access] checkAccess failed', e);
  }
  return _access;
}

export function hasAccess() { return _access; }
/** Epoch ms when access ends (0 if none/unknown). */
export function accessExpiryMs() { return _expiryMs; }

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
  _access = computeAccess(info);
  return _access;
}
