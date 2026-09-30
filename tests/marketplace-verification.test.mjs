import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PremblyVerificationError,
  getPremblyApiKey,
  premblyOutcome,
  verifyPremblyIdentity,
} from '../api/_marketplaceVerification.js';
import handler, { canPublishPublicly } from '../api/marketplace.js';

test('public discovery hides expired, unverified and disabled seller plans', () => {
  const seller = { verification_status: 'verified', public_selling_enabled: true, public_plan_expires_at: '2026-10-01T00:00:00Z' };
  assert.equal(canPublishPublicly(seller, Date.parse('2026-09-14')), true);
  assert.equal(canPublishPublicly(seller, Date.parse('2026-10-01')), false);
  assert.equal(canPublishPublicly({ ...seller, verification_status: 'pending' }, Date.parse('2026-09-14')), false);
  assert.equal(canPublishPublicly({ ...seller, public_selling_enabled: false }, Date.parse('2026-09-14')), false);
});

test('accepts successful BVN and NIN face responses', () => {
  assert.equal(premblyOutcome({
    status: true,
    response_code: '00',
    data: { bvn: '12345678901', face_data: { status: true } },
  }, 'bvn_face', '12345678901'), 'verified');

  assert.equal(premblyOutcome({
    status: 'true',
    response_code: '00',
    face_data: { status: 'true' },
    nin_data: { nin: '10987654321' },
  }, 'nin_face', '10987654321'), 'verified');
});

test('rejects a genuine face mismatch but not an incomplete successful response', () => {
  assert.equal(premblyOutcome({
    status: true,
    response_code: '00',
    data: { bvn: '12345678901', face_data: { status: false } },
  }, 'bvn_face', '12345678901'), 'rejected');

  assert.throws(() => premblyOutcome({
    status: true,
    response_code: '00',
    data: { bvn: '12345678901' },
  }, 'bvn_face', '12345678901'), (error) => error instanceof PremblyVerificationError && error.code === 'PREMBLY_RESPONSE_INVALID');
});

test('supports the documented server secret and migration aliases', () => {
  const previous = {
    api: process.env.PREMBLY_API_KEY,
    secret: process.env.PREMBLY_SECRET_KEY,
    identity: process.env.IDENTITYPASS_API_KEY,
  };
  delete process.env.PREMBLY_API_KEY;
  process.env.PREMBLY_SECRET_KEY = 'secret-alias';
  process.env.IDENTITYPASS_API_KEY = 'legacy-alias';
  assert.equal(getPremblyApiKey(), 'secret-alias');
  if (previous.api === undefined) delete process.env.PREMBLY_API_KEY; else process.env.PREMBLY_API_KEY = previous.api;
  if (previous.secret === undefined) delete process.env.PREMBLY_SECRET_KEY; else process.env.PREMBLY_SECRET_KEY = previous.secret;
  if (previous.identity === undefined) delete process.env.IDENTITYPASS_API_KEY; else process.env.IDENTITYPASS_API_KEY = previous.identity;
});

test('sends the correct Prembly request and classifies provider failures', async () => {
  const previous = process.env.PREMBLY_API_KEY;
  process.env.PREMBLY_API_KEY = 'server-secret';
  let request;
  const success = await verifyPremblyIdentity({
    method: 'nin_face',
    number: '10987654321',
    image: 'base64-image',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ status: true, response_code: '00', face_data: { status: true }, nin_data: { nin: '10987654321' } }), { status: 200 });
    },
  });
  assert.equal(success.response_code, '00');
  assert.equal(request.url, 'https://api.prembly.com/verification/nin_w_face');
  assert.equal(request.options.headers['x-api-key'], 'server-secret');
  assert.deepEqual(JSON.parse(request.options.body), { number: '10987654321', image: 'base64-image' });

  await assert.rejects(() => verifyPremblyIdentity({
    method: 'bvn_face',
    number: '12345678901',
    image: 'base64-image',
    fetchImpl: async () => new Response(JSON.stringify({ status: false, response_code: '03' }), { status: 200 }),
  }), (error) => error.code === 'PREMBLY_WALLET_EMPTY' && error.uncertain === false);

  await assert.rejects(() => verifyPremblyIdentity({
    method: 'bvn_face',
    number: '12345678901',
    image: 'base64-image',
    fetchImpl: async () => new Response(JSON.stringify({ status: false }), { status: 401 }),
  }), (error) => error.code === 'PREMBLY_CREDENTIALS_INVALID' && error.uncertain === false);

  if (previous === undefined) delete process.env.PREMBLY_API_KEY; else process.env.PREMBLY_API_KEY = previous;
});

test('paid Premium activation remains off in preview', async () => {
  const previous = process.env.MARKETPLACE_PAYMENTS_ENABLED;
  delete process.env.MARKETPLACE_PAYMENTS_ENABLED;
  let payload;
  const res = {
    setHeader() {},
    status(value) { this.statusCode = value; return this; },
    json(value) { payload = value; return this; },
  };
  try {
    await handler({ method: 'POST', url: '/api/marketplace?action=activate-premium', headers: {}, query: { action: 'activate-premium' }, body: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(payload.code, 'MARKETPLACE_PREVIEW');
  } finally {
    if (previous === undefined) delete process.env.MARKETPLACE_PAYMENTS_ENABLED;
    else process.env.MARKETPLACE_PAYMENTS_ENABLED = previous;
  }
});
