import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketplaceReferralError, ensureOpenReferralAgreement, resolveMarketplaceReferral } from '../api/_marketplaceReferral.js';

const listing = { id: 'listing-1', seller_id: 'seller-1', title: 'Course', visibility: 'public', private_access_token: null, resale_policy: 'fixed_percent', resale_commission_percent: 20, status: 'published' };
const profile = { clerk_id: 'referrer-1', full_name: 'Ada Creator', username: 'ada', purchase_code: 'ADA123' };

function client({ listingRow = listing, profileRow = profile, agreement = null } = {}) {
  const upserts = [];
  return {
    upserts,
    from(table) {
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        ilike(key, value) { filters[key] = value; return query; },
        upsert(value) { upserts.push({ table, value }); return Promise.resolve({ error: null }); },
        maybeSingle() {
          if (table === 'marketplace_listings') return Promise.resolve({ data: listingRow, error: null });
          if (table === 'profiles') return Promise.resolve({ data: profileRow?.purchase_code.toUpperCase() === String(filters.purchase_code).toUpperCase() ? profileRow : null, error: null });
          if (table === 'marketplace_resale_requests') return Promise.resolve({ data: agreement, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return query;
    },
  };
}

test('personal purchase code resolves to fixed product referral terms', async () => {
  const result = await resolveMarketplaceReferral(client(), { listingId: listing.id, buyerUserId: 'buyer-1', code: 'ada123' });
  assert.equal(result.referrerUserId, 'referrer-1');
  assert.equal(result.referrerName, 'Ada Creator');
  assert.equal(result.commissionPercent, 20);
  assert.equal(result.code, 'ADA123');
});

test('self-referrals are blocked', async () => {
  await assert.rejects(
    resolveMarketplaceReferral(client(), { listingId: listing.id, buyerUserId: 'referrer-1', code: 'ADA123' }),
    (error) => error instanceof MarketplaceReferralError && error.code === 'SELF_REFERRAL_NOT_ALLOWED',
  );
});

test('approval-required products reject an unapproved referrer', async () => {
  const approvalListing = { ...listing, resale_policy: 'approval_required', resale_commission_percent: null };
  await assert.rejects(
    resolveMarketplaceReferral(client({ listingRow: approvalListing }), { listingId: listing.id, buyerUserId: 'buyer-1', code: 'ADA123' }),
    (error) => error instanceof MarketplaceReferralError && error.code === 'REFERRER_NOT_APPROVED',
  );
});

test('open referrals create the approved agreement used by the atomic purchase function', async () => {
  const supabase = client();
  const referral = await resolveMarketplaceReferral(supabase, { listingId: listing.id, buyerUserId: 'buyer-1', code: 'ADA123' });
  await ensureOpenReferralAgreement(supabase, referral);
  assert.equal(supabase.upserts.length, 1);
  assert.deepEqual(supabase.upserts[0].value, {
    listing_id: listing.id,
    requester_id: 'referrer-1',
    seller_id: 'seller-1',
    requested_commission_percent: 20,
    status: 'approved',
    approved_at: supabase.upserts[0].value.approved_at,
    updated_at: supabase.upserts[0].value.updated_at,
  });
});
