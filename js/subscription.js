// =============================================
// Access — RevenueCat auto-renewable subscription ($6.99/year, `mq_yearly`)
// =============================================
// Apple manages renewal, billing, reminders and cancellation — nothing to run
// day-to-day. The app just asks RevenueCat "does this user have the `access`
// entitlement right now?" A user has access if that entitlement is active (a live
// subscription OR a manual grant from the RevenueCat dashboard), OR they're a
// grandfathered legacy buyer of the old PAID app.
//
// No bundler here, so we reach the plugin via window.Capacitor.Plugins.Purchases
// (the ESM `Purchases` export is just a thin Proxy over registerPlugin('Purchases'),
// so direct calls are identical). Requires npm run cap:sync to add it natively.

// --- Config (public SDK keys — safe to embed; Rob pastes the real values) -------
const RC_API_KEY_IOS = 'REVENUECAT_IOS_KEY';        // appl_… from RevenueCat → API keys
const RC_API_KEY_ANDROID = 'REVENUECAT_ANDROID_KEY'; // goog_… (Android)
const PRODUCT_ID = 'mq_yearly';                      // the auto-renewable subscription id
const ENTITLEMENT_ID = 'access';                     // RevenueCat entitlement granted by mq_yearly
                                                     // (also what Rob grants manually to comp/extend a user)

// Grandfathering: iOS users who bought the paid app keep full access free until
// GRANDFATHER_UNTIL. Detected via CFBundleVersion at original purchase: paid builds
// are < 145; the first subscription build (and every new install) is ≥ 145.
const SUBSCRIPTION_FIRST_BUILD = 145;
const GRANDFATHER_UNTIL = Date.parse('2027-08-31T23:59:59Z');

// -------------------------------------------------------------------------------
function rc() { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases) || null; }

/** True only where a native store + the RevenueCat plugin exist (iOS/Android app). */
export function subscriptionsSupported() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && rc());
}

let _configured = false;
let _access = false;
let _expiryMs = 0; // when access ends (subscription/grant expiry), 0 = none/unknown

/** Configure RevenueCat and do the first access check. Safe/no-op off-native. */
export async function initSubscription() {
  const P = rc();
  if (!P) return;
  const isAndroid = window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android';
  const apiKey = isAndroid ? RC_API_KEY_ANDROID : RC_API_KEY_IOS;
  if (!apiKey || apiKey.indexOf('REVENUECAT_') === 0) {
    console.warn('[access] RevenueCat API key not set — gate inert');
    return;
  }
  try {
    await P.configure({ apiKey });
    _configured = true;
    await refreshAccess();
  } catch (e) {
    console.warn('[access] configure failed', e);
  }
}

function computeAccess(customerInfo) {
  _expiryMs = 0;
  if (!customerInfo) return false;
  // 1) Active `access` entitlement — a live subscription OR a manual dashboard grant.
  const active = customerInfo.entitlements && customerInfo.entitlements.active;
  const ent = active && active[ENTITLEMENT_ID];
  if (ent) {
    _expiryMs = ent.expirationDate ? Date.parse(ent.expirationDate) : 0; // null = no expiry (e.g. lifetime grant)
    return true;
  }
  // 2) Grandfathered legacy paid buyer? (iOS only — originalApplicationVersion is null on Android)
  const oav = customerInfo.originalApplicationVersion;
  const buildNum = oav ? parseInt(oav, 10) : NaN;
  if (!isNaN(buildNum) && buildNum < SUBSCRIPTION_FIRST_BUILD && Date.now() < GRANDFATHER_UNTIL) {
    _expiryMs = GRANDFATHER_UNTIL;
    return true;
  }
  return false;
}

/** Re-fetch customer info and recompute access. Returns the boolean. */
export async function refreshAccess() {
  const P = rc();
  if (!P || !_configured) return _access;
  try {
    const { customerInfo } = await P.getCustomerInfo();
    _access = computeAccess(customerInfo);
  } catch (e) {
    console.warn('[access] getCustomerInfo failed', e);
  }
  return _access;
}

export function hasAccess() { return _access; }
/** Epoch ms when access ends (0 if none/unknown). */
export function accessExpiryMs() { return _expiryMs; }

function pickPackage(offerings) {
  const o = offerings && offerings.current;
  if (!o || !o.availablePackages || !o.availablePackages.length) return null;
  return o.availablePackages.find(p => p.product && p.product.identifier === PRODUCT_ID)
      || o.availablePackages.find(p => p.packageType === 'ANNUAL')
      || o.availablePackages[0];
}

/** Localized price string for the paywall (e.g. "$6.99"). '' if unavailable. */
export async function getPriceString() {
  const P = rc();
  if (!P) return '';
  try {
    const offerings = await P.getOfferings();
    const pkg = pickPackage(offerings);
    return (pkg && pkg.product && pkg.product.priceString) || '';
  } catch { return ''; }
}

/** Subscribe to the yearly plan. Resolves true if access is now granted.
 *  A user cancel resolves false (RevenueCat sets userCancelled); real errors throw. */
export async function purchase() {
  const P = rc();
  if (!P) return false;
  const offerings = await P.getOfferings();
  const pkg = pickPackage(offerings);
  if (!pkg) throw new Error('No product available (check the RevenueCat offering + mq_yearly).');
  try {
    const { customerInfo } = await P.purchasePackage({ aPackage: pkg });
    _access = computeAccess(customerInfo);
    return _access;
  } catch (e) {
    if (e && e.userCancelled) return false;
    throw e;
  }
}

/** Restore a prior purchase (also re-grants grandfathered access). */
export async function restore() {
  const P = rc();
  if (!P) return false;
  const { customerInfo } = await P.restorePurchases();
  _access = computeAccess(customerInfo);
  return _access;
}
