import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { allowedListingPayload, publicListing, trustScoreForSeller } from '../api/marketplace.js';
import { buildMarketplaceEmail } from '../api/_marketplaceEmail.js';
import { validateMarketplaceFile } from '../api/_marketplaceStorage.js';

const draft = { title: 'Creator templates', summary: 'Useful templates', description: '', category: 'templates', price: 1000, deliveryUrl: 'https://example.com/product', visibility: 'private' };

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
  for(const file of [{name:'virus.exe',contentType:'application/pdf',size:100},{name:'video.mp4',contentType:'video/mp4',size:100},{name:'huge.zip',contentType:'application/zip',size:251*1024*1024},{name:'empty.pdf',contentType:'application/pdf',size:0}]) assert.throws(()=>validateMarketplaceFile(file));
  assert.equal(validateMarketplaceFile({name:'My product.pdf',contentType:'application/pdf',size:100}),'My_product.pdf');
});

test('new sellers have no invented trust score; only completed/upheld outcomes affect it',()=>{
  assert.equal(trustScoreForSeller(null),null);
  assert.equal(trustScoreForSeller({completed_orders_count:0,upheld_disputes_count:0,trust_score:100}),null);
  assert.equal(trustScoreForSeller({completed_orders_count:9,upheld_disputes_count:1}),90);
});
