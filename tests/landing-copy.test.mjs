import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('public landing page uses the new product-neutral message', async () => {
  const source = await readFile(new URL('../src/pages/OnboardingPage.tsx', import.meta.url), 'utf8');

  assert.match(source, /Built for what you/);
  assert.match(source, /actually need\./);
  assert.match(source, /Digital Marketplace/);
});

test('public landing page does not advertise CapCut or premium subscriptions', async () => {
  const source = await readFile(new URL('../src/pages/OnboardingPage.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /capcut/i);
  assert.doesNotMatch(source, /premium subscriptions?/i);
  assert.doesNotMatch(source, /subscription countdown/i);
});
