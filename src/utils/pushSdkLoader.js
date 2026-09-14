// Queued callbacks are not evidence that the SDK has loaded.
export async function loadPushSdk(windowObject, documentObject) {
  if (!documentObject || typeof windowObject.OneSignal?.init === 'function') return;
  let script = documentObject.querySelector('script[src*="OneSignalSDK.page.js"]');
  await new Promise((resolve, reject) => {
    const created = !script;
    if (created) {
      script = documentObject.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.async = true;
      script.defer = true;
    }
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => {
      if (created) script.remove();
      reject(new Error('ONESIGNAL_SDK_LOAD_FAILED'));
    }, { once: true });
    if (created) documentObject.head.appendChild(script);
  });
}
