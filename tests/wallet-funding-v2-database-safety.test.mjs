import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

test("notification failure cannot roll back wallet credit", () => {
  const migration = read(
    "supabase/migrations/20260728130000_wallet_funding_v2.sql",
  );

  const insertIndex = migration.indexOf(
    "insert into public.messages",
  );
  const exceptionIndex = migration.indexOf(
    "exception",
    insertIndex,
  );
  const returnIndex = migration.indexOf(
    "return pg_catalog.jsonb_build_object",
    insertIndex,
  );

  assert.notEqual(insertIndex, -1);
  assert.notEqual(exceptionIndex, -1);
  assert.notEqual(returnIndex, -1);
  assert.ok(insertIndex < exceptionIndex);
  assert.ok(exceptionIndex < returnIndex);
  assert.match(
    migration,
    /wallet funding credited but notification failed/,
  );
});

test("staging SQL verifies notification failure and provider collision", () => {
  const verification = read(
    "supabase/wallet_funding_v2_staging_verify.sql",
  );

  assert.match(
    verification,
    /staging forced notification failure/,
  );
  assert.match(
    verification,
    /duplicate provider transaction ID was accepted/,
  );
  assert.match(
    verification,
    /has_function_privilege/,
  );
  assert.match(verification, /rollback;/i);
});

test("staging runner performs real concurrent RPC calls", () => {
  const runner = read(
    "scripts/wallet-funding-v2-staging.mjs",
  );

  assert.match(runner, /Array\.from\(\s*\{ length: 8 \}/);
  assert.match(runner, /Promise\.all/);
  assert.match(runner, /already_processed/);
  assert.match(runner, /collisionProvider/);
  assert.match(runner, /finally/);
  assert.match(runner, /cleanup/);
});

test("staging runner has an explicit, target-bound preflight guard", () => {
  const runner = read(
    "scripts/wallet-funding-v2-staging.mjs",
  );
  const packageJson = read("package.json");

  assert.match(
    runner,
    /PLUGSY_STAGING_TEST_CONFIRMATION/,
  );
  assert.match(
    runner,
    /I_UNDERSTAND_THIS_IS_DISPOSABLE_STAGING/,
  );
  assert.match(
    runner,
    /SUPABASE_STAGING_EXPECTED_PROJECT_REF/,
  );
  assert.match(
    runner,
    /!expectedProjectRef/,
  );
  assert.match(
    runner,
    /confirmation\s*!==\s*requiredConfirmation/,
  );
  assert.match(
    runner,
    /\/\^\[a-z0-9\]\+\$\/\.test\(expectedProjectRef\)/,
  );
  assert.match(
    runner,
    /stagingUrl\.hostname\s*!==\s*expectedHostname/,
  );

  const validationIndex = runner.indexOf(
    "stagingUrl.hostname !== expectedHostname",
  );
  const createClientIndex = runner.indexOf(
    "createClient(url, serviceKey",
  );

  assert.ok(validationIndex >= 0);
  assert.ok(createClientIndex > validationIndex);

  for (const productionVariable of [
    "VITE_SUPABASE_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]) {
    assert.doesNotMatch(
      runner,
      new RegExp(productionVariable),
    );
  }

  const consoleCalls =
    runner.match(
      /console\.(?:log|error|warn)\([\s\S]*?\);/g,
    ) || [];

  for (const consoleCall of consoleCalls) {
    assert.doesNotMatch(consoleCall, /serviceKey/);
    assert.doesNotMatch(
      consoleCall,
      /SUPABASE_STAGING_SERVICE_ROLE_KEY/,
    );
  }
  assert.doesNotMatch(
    packageJson,
    /wallet-funding-v2-staging/,
  );
});
