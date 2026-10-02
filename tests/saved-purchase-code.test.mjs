import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PurchaseCodeProfileError,
  findLatestPurchaseCode,
  normalizePurchaseCode,
  resolvePurchaseCodeForPurchase,
} from '../api/_savedPurchaseCode.js';

const profileClient = ({ savedCode = null, ownerId = 'user_referrer' } = {}) => ({
  from(table) {
    assert.equal(table, 'profiles');
    const state = { select: '', filters: {} };
    return {
      select(value) { state.select = value; return this; },
      eq(key, value) { state.filters[key] = value; return this; },
      async maybeSingle() {
        if (state.select === 'saved_purchase_code') return { data: { saved_purchase_code: savedCode }, error: null };
        if (state.filters.purchase_code) return { data: { clerk_id: ownerId, full_name: 'Ada', purchase_code: state.filters.purchase_code }, error: null };
        return { data: null, error: null };
      },
    };
  },
});

test('normalizes and automatically resolves the saved purchase code', async () => {
  assert.equal(normalizePurchaseCode('  plug-123  '), 'PLUG-123');
  const result = await resolvePurchaseCodeForPurchase(profileClient({ savedCode: 'PLUG-123' }), 'user_buyer', null);
  assert.equal(result.code, 'PLUG-123');
  assert.equal(result.owner.ownerId, 'user_referrer');
  assert.equal(result.shouldSave, false);
});

test('blocks saving or using a self-referral code', async () => {
  await assert.rejects(
    () => resolvePurchaseCodeForPurchase(profileClient({ ownerId: 'user_buyer' }), 'user_buyer', 'PLUG-SELF'),
    (error) => error instanceof PurchaseCodeProfileError && error.code === 'PURCHASE_CODE_SELF',
  );
});

test('chooses the most recently used code across existing purchase history', async () => {
  const historyClient = {
    from(table) {
      const row = table === 'orders'
        ? { purchase_code_used: 'OLDER-CODE', created_at: '2026-08-01T10:00:00Z' }
        : { purchase_code_used: 'LATEST-CODE', created_at: '2026-09-01T10:00:00Z' };
      return {
        select() { return this; },
        eq() { return this; },
        not() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() { return { data: row, error: null }; },
      };
    },
  };
  assert.equal(await findLatestPurchaseCode(historyClient, 'user_buyer'), 'LATEST-CODE');
});
