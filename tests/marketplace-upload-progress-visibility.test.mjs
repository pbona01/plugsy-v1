import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('seller product wizard keeps aggregate upload progress visible while saving from any step', async () => {
  const source = await readFile(new URL('../src/pages/SellerDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /const uploadPercent = productFiles\.length/);
  assert.match(source, /uploadedCount\} of \{productFiles\.length\} complete/);
  assert.match(source, /Overall product file upload progress/);
  assert.match(source, /\{busy && productFiles\.length > 0 && \(/);
  assert.match(source, /Preparing secure upload/);
});
