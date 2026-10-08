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

test('dashboard uses the configured Plugsy WhatsApp line and rejects unrelated hosts', async () => {
  const source = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /siteSettings\?\.support_whatsapp/);
  assert.match(source, /\['wa\.me', 'api\.whatsapp\.com', 'www\.whatsapp\.com', 'whatsapp\.com'\]/);
  assert.match(source, /CAPCUT_WHATSAPP_MESSAGE/);
  assert.match(source, /href=\{capCutWhatsAppUrl \|\| '\/chat'\}/);
});
