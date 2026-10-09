import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { allowedListingPayload, publicListing, trustScoreForSeller } from '../api/marketplace.js';
import { buildMarketplaceEmail } from '../api/_marketplaceEmail.js';
import { validateMarketplaceFile } from '../api/_marketplaceStorage.js';

const draft = { title: 'Creator templates', summary: 'Useful templates', description: 'A complete set of practical creator templates.', category: 'templates', price: 1000, deliveryUrl: 'https://example.com/product', visibility: 'private' };

test('listing validation rejects invalid money, permissions and delivery protocols', () => {
  for (const price of [-1, 99, Infinity, 'invalid', 10000001]) assert.ok(allowedListingPayload({ ...draft, price }).error);
  for (const deliveryUrl of ['javascript:alert(1)', 'http://example.com/file', 'https://user:password@example.com/file']) assert.ok(allowedListingPayload({ ...draft, deliveryUrl }).error);
  assert.ok(allowedListingPayload({ ...draft, visibility: 'everyone' }).error);
  assert.ok(allowedListingPayload({ ...draft, resalePolicy: 'fixed_percent', resaleCommissionPercent: 90 }).error);
});

test('listing payload never accepts browser ownership or approval fields', () => {
  const result = allowedListingPayload({ ...draft, seller_id: 'attacker', status: 'published', public_selling_enabled: true });
  assert.equal(result.error, undefined);
  assert.equal(result.payload.seller_id, undefined);
  assert.equal(result.payload.status, undefined);
  assert.equal(result.payload.public_selling_enabled, undefined);
});

test('public product serialization does not leak private delivery or access tokens', () => {
  const result = publicListing({ id: 'product', price: 1000, delivery_url: 'SECRET_DELIVERY', private_access_token: 'SECRET_TOKEN' }, null);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('SECRET'), false);
  assert.equal(result.seller.verified, false);
});

test('checkout and releases are disabled without explicit launch configuration', async () => {
  const previous = process.env.MARKETPLACE_PAYMENTS_ENABLED;
  delete process.env.MARKETPLACE_PAYMENTS_ENABLED;
  try {
    for (const action of ['purchase', 'release-due']) {
      const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
      await handler({ method: 'POST', url: `/api/marketplace?action=${action}`, headers: {} }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.code, 'MARKETPLACE_PREVIEW');
      assert.equal(res.headers['Cache-Control'], 'private, no-store');
    }
  } finally {
    if (previous === undefined) delete process.env.MARKETPLACE_PAYMENTS_ENABLED;
    else process.env.MARKETPLACE_PAYMENTS_ENABLED = previous;
  }
});

test('marketplace receipts escape product text and never include delivery secrets', () => {
  const email=buildMarketplaceEmail({kind:'receipt',recipient:'buyer@example.invalid',payload:{title:'<img src=x onerror=alert(1)>',reference:'ORDER',amount:1000,delivery_url:'SECRET_DELIVERY'}});
  assert.equal(email.html.includes('<img'),false);
  assert.ok(email.html.includes('&lt;img'));
  assert.equal(JSON.stringify(email).includes('SECRET_DELIVERY'),false);
});

test('file validation rejects executable files, mismatched extensions and oversized uploads', () => {
  for(const file of [{name:'virus.exe',contentType:'application/pdf',size:100},{name:'video.mp4',contentType:'application/pdf',size:100},{name:'huge.zip',contentType:'application/zip',size:251*1024*1024},{name:'empty.pdf',contentType:'application/pdf',size:0}]) assert.throws(()=>validateMarketplaceFile(file));
  assert.equal(validateMarketplaceFile({name:'My product.pdf',contentType:'application/pdf',size:100}),'My_product.pdf');
});

test('new sellers have no invented trust score; only completed/upheld outcomes affect it',()=>{
  assert.equal(trustScoreForSeller(null),null);
  assert.equal(trustScoreForSeller({completed_orders_count:0,upheld_disputes_count:0,trust_score:100}),null);
  assert.equal(trustScoreForSeller({completed_orders_count:9,upheld_disputes_count:1}),90);
});

test('buyer library only returns active entitlements backed by paid orders', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../api/marketplace.js', import.meta.url), 'utf8'));
  const libraryStart = source.indexOf('async function library');
  const deliveryStart = source.indexOf('async function delivery', libraryStart);
  const librarySource = source.slice(libraryStart, deliveryStart);
  assert.match(librarySource, /\.eq\(["']access_status["'],\s*["']active["']\)/);
  assert.match(librarySource, /\.eq\(["']order\.payment_status["'],\s*["']paid["']\)/);
});

test('refund migration repairs and continuously revokes refunded entitlements', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../supabase/migrations/20261007143000_marketplace_refund_access_enforcement_v1.sql', import.meta.url), 'utf8'));
  assert.match(source, /payment_status\s*=\s*'refunded'/i);
  assert.match(source, /set\s+access_status\s*=\s*'revoked'/i);
  assert.match(source, /after\s+update\s+of\s+payment_status/i);
});

test('mobile marketplace and Plugsy products use compact two-column product grids', async () => {
  const { readFile } = await import('node:fs/promises');
  const [marketplace, products] = await Promise.all([
    readFile(new URL('../src/pages/Marketplace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Products.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(marketplace, /mt-7 grid grid-cols-2 gap-3/);
  assert.match(marketplace, /aspect-\[4\/3\]/);
  assert.match(products, /grid grid-cols-2 gap-3/);
  assert.match(products, /card-premium group flex min-w-0 flex-col/);
  assert.match(products, /plan\.features\.slice\(0, 2\)/);
  assert.match(products, /line-clamp-3 leading-tight text-brand-text\/90 sm:line-clamp-none/);
  assert.match(products, /more benefits/);
});

test('cookie choices persist ad consent and clearly confirm the selected mode', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/components/marketplace/MarketplaceCookieConsent.tsx', import.meta.url), 'utf8'));
  assert.match(source, /marketing, savedAt/);
  assert.match(source, /plugsy-cookie-consent/);
  assert.match(source, /Ad measurement enabled for Plugsy visits and purchases/);
});

test('marketplace ad measurement is consent gated, encrypted and wired to both providers', async () => {
  const { readFile } = await import('node:fs/promises');
  const [api, ads, productPage] = await Promise.all([
    readFile(new URL('../api/marketplace.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/_marketplaceAds.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/MarketplaceProductPage.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(api, /body\.adMarketingConsent === true/);
  assert.match(api, /sendMarketplacePurchaseEvents/);
  assert.match(ads, /aes-256-gcm/);
  assert.match(ads, /graph\.facebook\.com/);
  assert.match(ads, /business-api\.tiktok\.com/);
  assert.match(productPage, /trackMarketplaceProductView/);
  assert.match(productPage, /trackMarketplaceCheckout/);
  assert.match(productPage, /trackMarketplacePurchase/);
});
