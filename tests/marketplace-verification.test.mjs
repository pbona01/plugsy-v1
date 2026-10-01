import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PremblyVerificationError,
  fetchPremblySession,
  getPremblyApiKey,
  hasPremblyWidgetConfiguration,
  premblySessionReference,
  premblyWidgetOutcome,
} from '../api/_marketplaceVerification.js';
import handler, { canPublishPublicly } from '../api/marketplace.js';

test('public discovery hides expired, unverified and disabled seller plans', () => {
  const seller = { verification_status: 'verified', public_selling_enabled: true, public_plan_expires_at: '2026-10-01T00:00:00Z' };
  assert.equal(canPublishPublicly(seller, Date.parse('2026-09-14')), true);
  assert.equal(canPublishPublicly(seller, Date.parse('2026-10-01')), false);
  assert.equal(canPublishPublicly({ ...seller, verification_status: 'pending' }, Date.parse('2026-09-14')), false);
  assert.equal(canPublishPublicly({ ...seller, public_selling_enabled: false }, Date.parse('2026-09-14')), false);
});

test('accepts only completed Prembly widget results with a passing face comparison', () => {
  assert.equal(premblyWidgetOutcome({
    verification: { status: 'VERIFIED' },
    data: { biometric_results: { average_confidence: 94.5 } },
  }), 'verified');
  assert.equal(premblyWidgetOutcome({
    verification: { status: 'VERIFIED' },
    data: { biometric_results: { comparison_result: [{ result: { status: true } }] } },
  }), 'verified');
});

test('rejects face mismatches and keeps incomplete provider responses pending', () => {
  assert.equal(premblyWidgetOutcome({
    verification: { status: 'VERIFIED' },
    data: { biometric_results: { average_confidence: 44 } },
  }), 'rejected');
  assert.equal(premblyWidgetOutcome({ status: 'processing' }), 'pending');
  assert.equal(premblySessionReference({ data: { widget_info: { user_ref: 'MP-PREMBLY-reference' } } }), 'MP-PREMBLY-reference');
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

test('fetches a Prembly widget session with server-only credentials', async () => {
  const previous = {
    api: process.env.PREMBLY_API_KEY,
    org: process.env.PREMBLY_ORGANISATION_ID,
    publicKey: process.env.PREMBLY_PUBLIC_KEY,
    widget: process.env.PREMBLY_WIDGET_ID,
  };
  process.env.PREMBLY_API_KEY = 'server-secret';
  process.env.PREMBLY_ORGANISATION_ID = 'organisation-id';
  process.env.PREMBLY_PUBLIC_KEY = 'test_pk_public';
  process.env.PREMBLY_WIDGET_ID = 'widget-id';
  assert.equal(hasPremblyWidgetConfiguration(), true);
  let request;
  const success = await fetchPremblySession('session_12345', async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ verification: { status: 'VERIFIED' } }), { status: 200 });
  });
  assert.equal(success.verification.status, 'VERIFIED');
  assert.equal(request.url, 'https://api.prembly.com/api/v1/checker-widget/sdk/sessions/session_12345/');
  assert.equal(request.options.headers['x-api-key'], 'server-secret');
  assert.equal(request.options.headers['x-organisation-id'], 'organisation-id');

  await assert.rejects(() => fetchPremblySession('session_12345', async () => new Response('{}', { status: 401 })),
    (error) => error instanceof PremblyVerificationError && error.code === 'PREMBLY_CREDENTIALS_INVALID');

  for (const [name, value] of Object.entries({ PREMBLY_API_KEY: previous.api, PREMBLY_ORGANISATION_ID: previous.org, PREMBLY_PUBLIC_KEY: previous.publicKey, PREMBLY_WIDGET_ID: previous.widget })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
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
