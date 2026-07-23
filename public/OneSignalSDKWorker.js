// Fallback OneSignal Worker to prevent 404 errors on physical mobile devices
// This ensures that if the browser or OS polls for this file behind the scenes, it resolves cleanly.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
importScripts("/onesignal-badge-sw.js");
