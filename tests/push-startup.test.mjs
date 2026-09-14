import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPushSdk } from '../src/utils/pushSdkLoader.js';
import { notifyPersistedMessage } from '../src/utils/messageNotification.js';
import { marketplaceAttempt, clearMarketplaceAttempt } from '../src/utils/marketplaceAttempt.js';

test('queued click callbacks do not prevent SDK loading', async () => {
  let appended = 0;
  const handlers = {};
  const document = {
    querySelector: () => null,
    createElement: () => ({ addEventListener: (event, handler) => { handlers[event] = handler; } }),
    head: { appendChild: () => { appended++; handlers.load(); } },
  };
  await loadPushSdk({ OneSignalDeferred: [() => {}] }, document);
  assert.equal(appended, 1);
});
test('SDK download failure is retryable', async () => {
  let removed = false;
  const handlers = {};
  await assert.rejects(loadPushSdk({}, {
    querySelector: () => null,
    createElement: () => ({ addEventListener: (event, handler) => { handlers[event] = handler; }, remove: () => { removed = true; } }),
    head: { appendChild: () => handlers.error() },
  }), /ONESIGNAL_SDK_LOAD_FAILED/);
  assert.equal(removed, true);
});
test('an HTTP 200 without eligible push subscriptions is not successful delivery', async () => {
  const result = await notifyPersistedMessage('message-1', {
    getToken: async () => 'token',
    fetchImpl: async () => new Response(JSON.stringify({ success: false, code: 'ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS' })),
  });
  assert.equal(result, false);
});
test('checkout retry keys survive remounts and remain actor/product scoped', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key,value) => values.set(key,value), removeItem: (key) => values.delete(key) };
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  assert.equal(marketplaceAttempt(storage,'user_a','product_a',()=>first),first);
  assert.equal(marketplaceAttempt(storage,'user_a','product_a',()=>second),first);
  assert.equal(marketplaceAttempt(storage,'user_b','product_a',()=>second),second);
  clearMarketplaceAttempt(storage,'user_a','product_a');
  assert.equal(marketplaceAttempt(storage,'user_a','product_a',()=>second),second);
});
