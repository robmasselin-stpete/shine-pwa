// =============================================
// Access — RevenueCat, NON-RENEWING $6.99 / year (product `mq_year`)
// =============================================
// Manual renewal by design: the user buys ONE year of access; it does NOT
// auto-renew. When it lapses they can buy another year. Apple doesn't track the
// expiry for non-renewing products, so we compute it ourselves from the purchase
// date RevenueCat records (customerInfo.nonSubscriptionTransactions).
//
// No bundler here, so we reach the plugin via window.Capacitor.Plugins.Purchases
// (the ESM `Purchases` export is just a thin Proxy over registerPlugin('Purchases'),
// so direct calls are identical). Requires npm run cap:sync to add it natively.
//
// A user has access if: they made a non-renewing purchase within the last year,
// OR they're a grandfathered legacy buyer of the old PAID app.

// --- Config (public SDK keys — safe to embed; Rob pastes the real values) -------
const RC_API_KEY_IOS = 'REVENUECAT_IOS_KEY';        // appl_… from RevenueCat → API keys
const RC_API_KEY_ANDROID = 'REVENUECAT_ANDROID_KEY'; // goog_… (Android)
const PRODUCT_ID = 'mq_year';                        // the non-renewing In-App Purchase id (ASC + Play + RevenueCat)
const ACCESS_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // one year of access per purchase
// Manual admin grants: a RevenueCat entitlement (attached to NO product) that Rob
// grants/extends/revokes per-customer from the dashboard — e.g. "give this person
// another year." Kept separate from PRODUCT_ID so a normal purchase never turns
// into lifetime access; used only for comps and extensions.
const COMP_ENTITLEMENT = 'comp';

// Grandfathering: iOS users who bought the paid app keep full access free until
// GRANDFATHER_UNTIL. Detected via CFBundleVersion at original purchase: paid builds
// are < 145; the first non-renewing build (and every new install) is ≥ 145.
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
let _expiryMs = 0; // when the current year of access ends (0 = none)

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

/** Latest purchase time (ms) of our non-renewing product, or 0 if never bought. */
function latestPurchaseMs(customerInfo) {
  let latest = 0;
  const txns = (customerInfo && customerInfo.nonSubscriptionTransactions) || [];
  for (const t of txns) {
    if (t.productIdentifier === PRODUCT_ID && t.purchaseDate) {
      const ms = Date.parse(t.purchaseDate);
      if (ms > latest) latest = ms;
    }
  }
  if (!latest && customerInfo && customerInfo.allPurchaseDates && customerInfo.allPurchaseDates[PRODUCT_ID]) {
    latest = Date.parse(customerInfo.allPurchaseDates[PRODUCT_ID]) || 0;
  }
  return latest;
}

function computeAccess(customerInfo) {
  _expiryMs = 0;
  if (!customerInfo) return false;
  // 0) Manual comp / extension granted from the RevenueCat dashboard.
  const active = customerInfo.entitlements && customerInfo.entitlements.active;
  if (active && active[COMP_ENTITLEMENT]) {
    const exp = active[COMP_ENTITLEMENT].expirationDate; // null = no expiry (lifetime comp)
    _expiryMs = exp ? Date.parse(exp) : 0;
    return true;
  }
  // 1) Non-renewing purchase still inside its year?
  const last = latestPurchaseMs(customerInfo);
  if (last) {
    _expiryMs = last + ACCESS_DURATION_MS;
    if (Date.now() < _expiryMs) return true;
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
/** Epoch ms when the current year of access ends (0 if none). */
export function accessExpiryMs() { return _expiryMs; }

function pickPackage(offerings) {
  const o = offerings && offerings.current;
  if (!o || !o.availablePackages || !o.availablePackages.length) return null;
  return o.availablePackages.find(p => p.product && p.product.identifier === PRODUCT_ID)
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

/** Buy one year of access. Resolves true if access is now granted.
 *  A user cancel resolves false (RevenueCat sets userCancelled); real errors throw. */
export async function purchase() {
  const P = rc();
  if (!P) return false;
  const offerings = await P.getOfferings();
  const pkg = pickPackage(offerings);
  if (!pkg) throw new Error('No product available (check the RevenueCat offering + mq_year).');
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
