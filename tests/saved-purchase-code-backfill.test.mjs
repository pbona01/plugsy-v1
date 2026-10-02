import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20261002193000_saved_purchase_code_backfill_v1.sql', import.meta.url),
  'utf8',
);

test('backfills the latest valid code without replacing a saved preference', () => {
  assert.match(migration, /row_number\(\) over/i);
  assert.match(migration, /order by history\.used_at desc nulls last/i);
  assert.match(migration, /buyer\.saved_purchase_code is null/i);
  assert.match(migration, /owner\.clerk_id <> history\.buyer_user_id/i);
});
