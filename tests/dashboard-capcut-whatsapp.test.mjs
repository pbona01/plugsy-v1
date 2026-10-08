import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('dashboard shows the one-week CapCut WhatsApp campaign only through October 15', async () => {
  const source = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /2026-10-16T00:00:00\+01:00/);
  assert.match(source, /Date\.now\(\) < CAPCUT_WHATSAPP_CAMPAIGN_END_AT/);
  assert.match(source, /Need CapCut Pro\?/);
  assert.match(source, /Tap here to subscribe through Plugsy on WhatsApp\./);
});

test('dashboard uses the supplied Plugsy CapCut WhatsApp link', async () => {
  const source = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /const CAPCUT_WHATSAPP_URL = 'https:\/\/wa\.me\/message\/NJ3G74ENJ2KHD1'/);
  assert.match(source, /href=\{CAPCUT_WHATSAPP_URL\}/);
  assert.match(source, /target="_blank"/);
});
