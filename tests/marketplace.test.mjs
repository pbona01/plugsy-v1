import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { allowedListingPayload, publicListing, trustScoreForSeller } from '../api/marketplace.js';
import { buildMarketplaceEmail } from '../api/_marketplaceEmail.js';
import { validateMarketplaceFile } from '../api/_marketplaceStorage.js';
import { matchesMarketplaceMediaSignature, supportsAutomaticMediaReview } from '../api/_marketplaceScanner.js';

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

test('wallet and guest checkout accept clean multi-item delivery and reject missing or unreviewed delivery', async () => {
  const { readFile } = await import('node:fs/promises');
  const migration = await readFile(new URL('../supabase/migrations/20261017100000_marketplace_checkout_delivery_items_v1.sql', import.meta.url), 'utf8');
  const walletCheckout = migration.slice(migration.indexOf('create or replace function public.marketplace_create_wallet_order_v1'), migration.indexOf('create or replace function public.marketplace_create_guest_checkout_v1'));
  const guestCheckout = migration.slice(migration.indexOf('create or replace function public.marketplace_create_guest_checkout_v1'), migration.indexOf('revoke all on function public.marketplace_create_wallet_order_v1'));
  assert.match(migration, /marketplace_listing_deliveries/);
  assert.match(migration, /a\.status = 'clean'/);
  for (const checkout of [walletCheckout, guestCheckout]) {
    assert.match(checkout, /marketplace_delivery_state_v1\(v_listing\.id, v_listing\.seller_id\)/);
    assert.match(checkout, /v_delivery_state='pending' then raise exception 'FILE_NOT_READY'/);
    assert.match(checkout, /v_delivery_state<>'ready' then raise exception 'DELIVERY_REQUIRED'/);
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
  assert.equal(validateMarketplaceFile({name:'My book.epub',contentType:'application/epub+zip',size:100}),'My_book.epub');
});

test('genuine images and videos can pass automatic signature review without exposing course files to a public scanner', () => {
  assert.equal(matchesMarketplaceMediaSignature('image/png', Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), true);
  assert.equal(matchesMarketplaceMediaSignature('image/jpeg', Buffer.from([0xff,0xd8,0xff,0xe0])), true);
  assert.equal(matchesMarketplaceMediaSignature('image/webp', Buffer.from('RIFF0000WEBP')), true);
  assert.equal(matchesMarketplaceMediaSignature('video/webm', Buffer.from([0x1a,0x45,0xdf,0xa3])), true);
  assert.equal(matchesMarketplaceMediaSignature('video/mp4', Buffer.from('0000ftypisom')), true);
  assert.equal(matchesMarketplaceMediaSignature('video/mp4', Buffer.from('MZ executable')), false);
  assert.equal(matchesMarketplaceMediaSignature('application/zip', Buffer.from('PK')), false);
  assert.equal(supportsAutomaticMediaReview('video/quicktime'), true);
  assert.equal(supportsAutomaticMediaReview('application/pdf'), false);
});

test('document scans continue automatically after upload while only unavailable checks go to manual review', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../api/marketplace.js', import.meta.url), 'utf8');
  const dashboard = await readFile(new URL('../src/pages/SellerDashboard.tsx', import.meta.url), 'utf8');
  assert.match(source, /action === 'check-upload-review'/);
  assert.match(source, /checkMarketplaceAssetScan\(asset\.scan_reference\)/);
  assert.match(source, /automatic:true/);
  assert.match(source, /manual_review:/);
  assert.match(source, /\['prepare-upload','complete-upload','check-upload-review'\]/);
  assert.match(dashboard, /request\("check-upload-review"/);
  assert.match(dashboard, /Security scan in progress/);
});

test('automatic approval uses the antivirus provider while private VirusTotal analysis remains a safe fallback', async () => {
  const { readFile } = await import('node:fs/promises');
  const scanner = await readFile(new URL('../api/_marketplaceScanner.js', import.meta.url), 'utf8');
  assert.match(scanner, /CLOUDMERSIVE_VIRUS_SCAN_API_KEY/);
  assert.match(scanner, /virus\/scan\/file\/advanced/);
  assert.match(scanner, /CleanResult/);
  assert.match(scanner, /private\/analyses/);
  assert.match(scanner, /private_analysis_requires_review/);
});

test('payout schedule includes Monday-Friday and seller identity review preserves Marketplace Premium when expiry is blank', async () => {
  const { readFile } = await import('node:fs/promises');
  const migration = await readFile(new URL('../supabase/migrations/20261019120000_marketplace_weekday_payout_and_plan_review_fix_v1.sql', import.meta.url), 'utf8');
  const payout = migration.slice(migration.indexOf('create or replace function public.marketplace_next_payout_at_v1'), migration.indexOf('-- Repair still-held orders'));
  const sellerReview = migration.slice(migration.indexOf('create or replace function public.marketplace_approve_seller_v1'), migration.indexOf('revoke all on function public.marketplace_next_payout_at_v1'));
  assert.match(payout, /if v_isodow = 6 then v_day := v_day \+ 2;\s*elsif v_isodow = 7 then v_day := v_day \+ 1;/i);
  assert.match(payout, /v_time <= time '11:00'/i);
  assert.match(migration, /update public\.marketplace_orders[\s\S]*?funds_status = 'held'/i);
  assert.match(migration, /update public\.marketplace_guest_orders[\s\S]*?funds_status = 'held'/i);
  assert.match(sellerReview, /public_selling_enabled = case[\s\S]*?else public_selling_enabled/i);
  assert.match(sellerReview, /public_plan_expires_at = coalesce\(p_plan_expires_at, public_plan_expires_at\)/i);
});

test('manual file approval only changes the uploaded asset, not seller plan entitlement', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../api/marketplace.js', import.meta.url), 'utf8');
  const fileReview = source.slice(source.indexOf("if (action === 'review-asset')"), source.indexOf("if (action === 'resolve-dispute')"));
  assert.match(fileReview, /from\('marketplace_assets'\)\.update\(\{ status: outcome/);
  assert.doesNotMatch(fileReview, /marketplace_approve_seller_v1|marketplace_seller_profiles|public_selling_enabled|public_plan_expires_at/);
});

test('seller identity review cannot mutate Marketplace Premium even if an old client sends an expiry', async () => {
  const { readFile } = await import('node:fs/promises');
  const [migration, api, adminPage] = await Promise.all([
    readFile(new URL('../supabase/migrations/20261020130000_decouple_marketplace_review_from_premium_v1.sql', import.meta.url), 'utf8'),
    readFile(new URL('../api/marketplace.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AdminMarketplace.tsx', import.meta.url), 'utf8'),
  ]);
  const reviewFunction = migration.slice(migration.indexOf('create or replace function public.marketplace_approve_seller_v1'), migration.indexOf('revoke all on function public.marketplace_approve_seller_v1'));
  const reviewUpdate = reviewFunction.slice(reviewFunction.indexOf('update public.marketplace_seller_profiles'), reviewFunction.indexOf('where user_id = p_seller_id'));
  const adminMutation = api.slice(api.indexOf("if (action === 'resolve-dispute')"), api.indexOf('if (result.error)', api.indexOf("if (action === 'resolve-dispute')")));
  assert.doesNotMatch(reviewUpdate, /public_selling_enabled|public_plan_expires_at/);
  assert.match(reviewFunction, /premium_entitlement_modified', false/);
  assert.match(adminMutation, /p_plan_expires_at: null/);
  assert.match(adminPage, /This review changes identity status only/);
  assert.doesNotMatch(adminPage, /type="datetime-local"/);
});

test('seller product deletion is a soft archive and leaves paid buyer delivery intact', async () => {
  const { readFile } = await import('node:fs/promises');
  const [api, seller] = await Promise.all([
    readFile(new URL('../api/marketplace.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/SellerDashboard.tsx', import.meta.url), 'utf8'),
  ]);
  const workspace = api.slice(api.indexOf('async function sellerWorkspace'), api.indexOf('async function sellerAdIntegrations'));
  const publish = api.slice(api.indexOf('async function publishListing'), api.indexOf('async function purchase'));
  const buyerDelivery = api.slice(api.indexOf('async function guestDelivery'), api.indexOf('async function openDispute'));
  assert.match(workspace, /filter\(\(listing\) => listing\.status !== 'archived'\)/);
  assert.match(publish, /\['published', 'paused', 'archived'\]/);
  assert.match(publish, /existing media review deferred/);
  assert.match(publish, /existing course media review deferred/);
  assert.doesNotMatch(publish, /marketplace_entitlements/);
  assert.match(buyerDelivery, /resolveDeliveryItems\(supabase, order\.listing_id, order\.listing_snapshot\)/);
  assert.match(seller, /status\(p, "archived"\)/);
  assert.match(seller, /Existing buyers still have access/);
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

test('course lessons have editable metadata and buyers always receive the current seller version', async () => {
  const { readFile } = await import('node:fs/promises');
  const [api, seller, buyer, migration] = await Promise.all([
    readFile(new URL('../api/marketplace.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/SellerDashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Marketplace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261014120000_marketplace_course_delivery_metadata_v1.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /add column if not exists description text not null default ''/i);
  assert.match(api, /async function updateDeliveries/);
  assert.match(api, /action === 'update-deliveries'/);
  assert.match(api, /resolveDeliveryItems\(supabase, order\.listing_id, order\.listing_snapshot\)/);
  assert.match(api, /description: row\.description \|\| ''/);
  assert.match(seller, /deliveryTitle: item\.title\.trim\(\)/);
  assert.match(seller, /Course updated\. Every buyer now sees the latest content\./);
  assert.match(buyer, /seller&apos;s latest version/);
  assert.match(buyer, /delivery\.description/);
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
