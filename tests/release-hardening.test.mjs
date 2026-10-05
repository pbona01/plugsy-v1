import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import assetlinksHandler from '../api/android-assetlinks.js';

const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const response = () => ({
  statusCode: 200,
  headers: new Map(),
  body: null,
  setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('authenticated APIs use explicit origin validation and private caching', () => {
  const helper = read('api/_httpSecurity.js');
  assert.match(helper, /https:\/\/www\.plugsy\.ng/);
  assert.match(helper, /private, no-store/);
  assert.doesNotMatch(helper, /Access-Control-Allow-Origin[^\n]+\*/);
  for (const file of ['api/wallet.js', 'api/payments.js', 'api/marketplace.js', 'api/portfolio.js']) {
    const source = read(file);
    assert.match(source, /rejectDisallowedOrigin/);
    assert.doesNotMatch(source, /Access-Control-Allow-Origin", "\*"/);
  }
});

test('Prembly completion requires the exact internal attempt reference', () => {
  const source = read('api/marketplace.js');
  assert.match(source, /const belongsToAttempt = sessionReference === reference/);
  assert.doesNotMatch(source, /sessionReference === reference \|\|/);
  assert.doesNotMatch(source, /sessionReference !== attempt\.reference &&/);
});

test('account deletion is public, authenticated and financially fail-closed', () => {
  const app = read('src/App.tsx');
  const api = read('api/account.js');
  assert.match(app, /path="\/account-deletion"/);
  assert.match(api, /requireVerifiedClerkUser/);
  assert.match(api, /ACCOUNT_BALANCE_REMAINS/);
  assert.match(api, /ACCOUNT_ACTIVITY_PENDING/);
  assert.match(api, /clerkClient\.users\.deleteUser/);
});

test('asset links fail closed until the Play signing fingerprint is configured', () => {
  const oldPackage = process.env.ANDROID_APP_PACKAGE;
  const oldFingerprint = process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT;
  delete process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT;
  const missing = response();
  assetlinksHandler({ method: 'GET' }, missing);
  assert.equal(missing.statusCode, 503);
  assert.deepEqual(missing.body, []);

  process.env.ANDROID_APP_PACKAGE = 'ng.plugsy.app';
  process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT = Array(32).fill('AA').join(':');
  const configured = response();
  assetlinksHandler({ method: 'GET' }, configured);
  assert.equal(configured.statusCode, 200);
  assert.equal(configured.body[0].target.package_name, 'ng.plugsy.app');

  if (oldPackage === undefined) delete process.env.ANDROID_APP_PACKAGE; else process.env.ANDROID_APP_PACKAGE = oldPackage;
  if (oldFingerprint === undefined) delete process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT; else process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT = oldFingerprint;
});

test('PWA uses one generated manifest with local brand assets', () => {
  const html = read('index.html');
  const vite = read('vite.config.ts');
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.doesNotMatch(html, /href="\/manifest\.json"/);
  assert.match(vite, /theme_color: "#0066ff"/);
  assert.match(vite, /src: "\/logo\.svg"/);
  assert.doesNotMatch(vite, /CapCut subscriptions/);
});
