// js/geo-background.js — background location for narrated walking tours (v1.5).
//
// Wraps @capacitor-community/background-geolocation, which runs a foreground service
// with a persistent notification on Android (foregroundServiceType=location) and
// uses Core Location background updates on iOS. This keeps location flowing while
// the screen is off / app backgrounded — required for the ElevenLabs narrated tours
// (phone in pocket, audio triggered by proximity to each mural).
//
// Native-only; a no-op on web. NOT yet wired into the tour flow — this is the
// integration point. Wire startBackgroundTour()/stopBackgroundTour() into the tour
// start/stop, then tune + test on the real device (Samsung S23).
//
// No bundler in this app, so the plugin is reached via window.Capacitor.Plugins
// rather than an ES import (bare specifiers fail here).

function bgPlugin() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  return (cap.Plugins && cap.Plugins.BackgroundGeolocation) || null;
}

let watcherId = null;

/**
 * Begin background location for an active tour. `onLocation({latitude, longitude,
 * accuracy, bearing, speed, time})` fires on each update, including when the app is
 * backgrounded or the screen is off. Shows a persistent notification on Android.
 * Returns true if background tracking started (native), false otherwise.
 */
export async function startBackgroundTour(onLocation) {
  const bg = bgPlugin();
  if (!bg || watcherId) return false;
  try {
    watcherId = await bg.addWatcher(
      {
        backgroundTitle: 'Mural Quest tour in progress',
        backgroundMessage: 'Guiding you to the next mural.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 8, // meters between updates — plenty for walking
      },
      (location, error) => {
        if (error) { console.warn('[bg-geo]', error.code, error.message); return; }
        if (location && typeof onLocation === 'function') onLocation(location);
      }
    );
    return true;
  } catch (e) {
    console.warn('[bg-geo] start failed', e);
    watcherId = null;
    return false;
  }
}

/** Stop background location (ends the foreground service / notification). */
export async function stopBackgroundTour() {
  const bg = bgPlugin();
  if (!bg || !watcherId) return;
  try { await bg.removeWatcher({ id: watcherId }); } catch (e) { /* ignore */ }
  watcherId = null;
}

export function isBackgroundTourActive() { return watcherId != null; }
export function backgroundTourAvailable() { return bgPlugin() != null; }
