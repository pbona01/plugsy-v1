import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261016120000_marketplace_upload_preserve_listing_state_v1.sql', import.meta.url);

test('completing an added product upload preserves the listing status and legacy delivery pointer', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  const listingUpdate = migration.match(/update public\.marketplace_listings[\s\S]*?;/i)?.[0] || '';

  assert.match(listingUpdate, /set updated_at\s*=\s*now\(\)/i);
  assert.doesNotMatch(listingUpdate, /status\s*=/i);
  assert.doesNotMatch(listingUpdate, /delivery_asset_id\s*=/i);
  assert.match(migration, /update public\.marketplace_assets set status='quarantined',actual_size=p_size/i);
});
