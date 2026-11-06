import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('dashboard no longer advertises the retired CapCut subscription', async () => {
  const source = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /CAPCUT_WHATSAPP/i);
  assert.doesNotMatch(source, /Need CapCut Pro/i);
  assert.doesNotMatch(source, /wa\.me\/message\/NJ3G74ENJ2KHD1/i);
});

test('retired CapCut plans are hidden and rejected without deleting order history', async () => {
  const [products, checkout, commerce, migration] = await Promise.all([
    readFile(new URL('../src/pages/Products.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/CheckoutConfirm.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../api/_walletCommerce.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261106160000_retire_capcut_pro_v1.sql', import.meta.url), 'utf8'),
  ]);

  assert.match(products, /isRetiredCapCutPlan/);
  assert.match(checkout, /PRODUCT_RETIRED|no longer sold by Plugsy/);
  assert.match(commerce, /PRODUCT_RETIRED/);
  assert.match(migration, /set is_active = false/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(orders|subscriptions|chats)/i);
});

test('admin subscriptions now report Marketplace Premium while chats remain routed', async () => {
  const [adminPage, adminApi, app] = await Promise.all([
    readFile(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../api-handlers/admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(adminPage, /Marketplace Premium/);
  assert.match(adminPage, /Free trials/);
  assert.match(adminPage, /Failed renewals/);
  assert.match(adminApi, /list-marketplace-subscriptions/);
  assert.match(adminApi, /marketplace_premium_payments/);
  assert.match(app, /path="\/admin\/chats"/);
  assert.match(app, /path="\/chats"/);
});
