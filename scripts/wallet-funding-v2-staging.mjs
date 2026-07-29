import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_STAGING_URL;
const serviceKey =
  process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY;
const expectedProjectRef =
  process.env.SUPABASE_STAGING_EXPECTED_PROJECT_REF;
const confirmation =
  process.env.PLUGSY_STAGING_TEST_CONFIRMATION;
const requiredConfirmation =
  "I_UNDERSTAND_THIS_IS_DISPOSABLE_STAGING";

if (
  !url ||
  !serviceKey ||
  !expectedProjectRef ||
  confirmation !== requiredConfirmation
) {
  console.error(
    "Missing required staging target configuration or confirmation",
  );
  process.exit(2);
}

if (!/^[a-z0-9]+$/.test(expectedProjectRef)) {
  console.error(
    "SUPABASE_STAGING_EXPECTED_PROJECT_REF is invalid",
  );
  process.exit(2);
}

let stagingUrl;
try {
  stagingUrl = new URL(url);
} catch {
  console.error("SUPABASE_STAGING_URL is invalid");
  process.exit(2);
}

const expectedHostname =
  `${expectedProjectRef}.supabase.co`;

if (stagingUrl.hostname !== expectedHostname) {
  console.error(
    "SUPABASE_STAGING_URL does not match the expected staging project",
  );
  process.exit(2);
}

console.log(
  "Confirmed staging project hostname:",
  stagingUrl.hostname,
);

const supabase = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const suffix =
  Date.now().toString(36) +
  crypto.randomUUID().replaceAll("-", "").slice(0, 8);

const userId = `staging_concurrency_${suffix}`;
const email = `staging-concurrency-${suffix}@example.test`;
const reference = `wallet_fund_stage_concurrent_${suffix}`;
const providerId = `flw_stage_concurrent_${suffix}`;

const collisionUserA =
  `staging_collision_a_${suffix}`;
const collisionUserB =
  `staging_collision_b_${suffix}`;
const collisionReferenceA =
  `wallet_fund_stage_collision_a_${suffix}`;
const collisionReferenceB =
  `wallet_fund_stage_collision_b_${suffix}`;
const collisionProvider =
  `flw_stage_collision_${suffix}`;

const rpc = async (
  targetReference,
  targetProvider,
  amount,
) => {
  const result = await supabase.rpc(
    "fulfill_wallet_funding_v2",
    {
      p_reference: targetReference,
      p_provider_transaction_id: targetProvider,
      p_provider_status: "successful",
      p_currency: "NGN",
      p_amount: amount,
    },
  );

  return result;
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const cleanup = async () => {
  const users = [
    userId,
    collisionUserA,
    collisionUserB,
  ];

  await supabase
    .from("messages")
    .delete()
    .in("user_id", users);

  await supabase
    .from("wallet_transactions")
    .delete()
    .in("user_id", users);

  await supabase
    .from("profiles")
    .delete()
    .in("clerk_id", users);
};

try {
  await cleanup();

  const { error: profileError } = await supabase
    .from("profiles")
    .insert([
      {
        clerk_id: userId,
        email,
        full_name: "Concurrency Test User",
        balance: 500,
        role: "user",
      },
      {
        clerk_id: collisionUserA,
        email: `collision-a-${suffix}@example.test`,
        full_name: "Collision User A",
        balance: 500,
        role: "user",
      },
      {
        clerk_id: collisionUserB,
        email: `collision-b-${suffix}@example.test`,
        full_name: "Collision User B",
        balance: 500,
        role: "user",
      },
    ]);

  if (profileError) throw profileError;

  const { error: transactionError } = await supabase
    .from("wallet_transactions")
    .insert([
      {
        user_id: userId,
        user_email: email,
        type: "fund",
        amount: 1000,
        fee: 0,
        status: "pending",
        reference,
        currency: "NGN",
        description: "Concurrent funding test",
        metadata: {},
      },
      {
        user_id: collisionUserA,
        user_email: `collision-a-${suffix}@example.test`,
        type: "fund",
        amount: 700,
        fee: 0,
        status: "pending",
        reference: collisionReferenceA,
        currency: "NGN",
        description: "Provider collision A",
        metadata: {},
      },
      {
        user_id: collisionUserB,
        user_email: `collision-b-${suffix}@example.test`,
        type: "fund",
        amount: 700,
        fee: 0,
        status: "pending",
        reference: collisionReferenceB,
        currency: "NGN",
        description: "Provider collision B",
        metadata: {},
      },
    ]);

  if (transactionError) throw transactionError;

  const concurrentResults = await Promise.all(
    Array.from(
      { length: 8 },
      () => rpc(reference, providerId, 1000),
    ),
  );

  const concurrentErrors =
    concurrentResults.filter((result) => result.error);

  assert(
    concurrentErrors.length === 0,
    `Concurrent same-reference RPC returned ${concurrentErrors.length} errors`,
  );

  const firstProcessed =
    concurrentResults.filter(
      (result) =>
        result.data?.already_processed === false,
    ).length;

  const duplicates =
    concurrentResults.filter(
      (result) =>
        result.data?.already_processed === true,
    ).length;

  assert(
    firstProcessed === 1,
    `Expected one first fulfilment, found ${firstProcessed}`,
  );

  assert(
    duplicates === 7,
    `Expected seven duplicate results, found ${duplicates}`,
  );

  const { data: profile, error: profileReadError } =
    await supabase
      .from("profiles")
      .select("balance")
      .eq("clerk_id", userId)
      .single();

  if (profileReadError) throw profileReadError;

  assert(
    Number(profile.balance) === 1500,
    `Concurrent calls produced balance ${profile.balance}`,
  );

  const { count: messageCount, error: messageError } =
    await supabase
      .from("messages")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("user_id", userId)
      .eq("event", "wallet_funded");

  if (messageError) throw messageError;

  assert(
    messageCount === 1,
    `Expected one notification, found ${messageCount}`,
  );

  const collisionResults = await Promise.all([
    rpc(
      collisionReferenceA,
      collisionProvider,
      700,
    ),
    rpc(
      collisionReferenceB,
      collisionProvider,
      700,
    ),
  ]);

  const collisionSuccesses =
    collisionResults.filter(
      (result) =>
        !result.error &&
        result.data?.success === true,
    );

  const collisionFailures =
    collisionResults.filter(
      (result) => result.error,
    );

  assert(
    collisionSuccesses.length === 1,
    `Expected one provider collision success, found ${collisionSuccesses.length}`,
  );

  assert(
    collisionFailures.length === 1,
    `Expected one provider collision failure, found ${collisionFailures.length}`,
  );

  const { data: collisionProfiles, error: collisionProfileError } =
    await supabase
      .from("profiles")
      .select("clerk_id,balance")
      .in("clerk_id", [
        collisionUserA,
        collisionUserB,
      ]);

  if (collisionProfileError) {
    throw collisionProfileError;
  }

  const collisionBalances =
    collisionProfiles.map((entry) =>
      Number(entry.balance),
    );

  assert(
    collisionBalances.filter(
      (balance) => balance === 1200,
    ).length === 1,
    `Expected one credited collision profile: ${collisionBalances}`,
  );

  assert(
    collisionBalances.filter(
      (balance) => balance === 500,
    ).length === 1,
    `Expected one untouched collision profile: ${collisionBalances}`,
  );

  console.log(
    "Wallet funding V2 staging concurrency verification passed.",
  );
} finally {
  await cleanup();
}
