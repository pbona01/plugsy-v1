import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeExternalUrl,
  normalizeOneLinkSettings,
  parseOneLinkProfileBio,
  validateOneLinkSavePayload,
  validateOneLinkUnpublishPayload,
} from "../shared/onelink.js";
import {
  classifyOneLinkUpdateResult,
  handleDraftMutation,
  handlePublic,
  handleUnpublish,
  revisionMatches,
  toOwnerResponse,
  withRevisionMatch,
} from "../api/onelink.js";

const rootFile = (path) => new URL(`../${path}`, import.meta.url);

const validDraft = (overrides = {}) => ({
  expectedRevision: null,
  displayName: "Plugsy Creator",
  biography: "Independent One Link biography",
  imageUrl: null,
  imagePublicId: null,
  wallpaperUrl: null,
  wallpaperPublicId: null,
  wallpaperTextMode: "light",
  settings: {
    schemaVersion: 1,
    theme: "dark-twilight",
    socials: [],
    projects: [],
    published: true,
    seoTitle: "",
    seoDescription: "",
    messageEnabled: true,
  },
  ...overrides,
});

const clone = (value) => structuredClone(value);

const makeProfile = (overrides = {}) => ({
  clerk_id: "user_owner",
  username: "creator",
  full_name: "Plugsy Creator",
  profile_pic_url: null,
  image_url: null,
  bio: "",
  one_link_username: "creator",
  one_link_display_name: "Plugsy Creator",
  one_link_biography: "Independent One Link biography",
  one_link_avatar_url: null,
  one_link_avatar_public_id: null,
  one_link_wallpaper_url: null,
  one_link_wallpaper_public_id: null,
  one_link_wallpaper_text_mode: "light",
  one_link_settings: normalizeOneLinkSettings({ published: false }),
  one_link_updated_at: "2026-08-02T09:00:00.000+00:00",
  ...overrides,
});

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeRequest = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
  url: "/api/onelink",
});

function makeFakeSupabase(initialProfile, options = {}) {
  const state = {
    profile: clone(initialProfile),
    calls: [],
    outcomes: [...(options.outcomes || [])],
  };
  const normalizeRevision = options.normalizeRevision || ((value) => value);

  const supabase = {
    from(table) {
      assert.equal(table, "profiles");
      return {
        update(patch) {
          const filters = [];
          const builder = {
            eq(column, value) {
              filters.push({ operator: "eq", column, value });
              return builder;
            },
            is(column, value) {
              filters.push({ operator: "is", column, value });
              return builder;
            },
            select() {
              return builder;
            },
            async maybeSingle() {
              const outcome = state.outcomes.shift() || {};
              state.calls.push({ patch: clone(patch), filters: clone(filters) });
              if (outcome.error) return { data: null, error: outcome.error };
              if (outcome.zeroRows) return { data: null, error: null };
              const matches = filters.every(({ operator, column, value }) =>
                operator === "is"
                  ? state.profile[column] === null && value === null
                  : state.profile[column] === value,
              );
              if (!matches) return { data: null, error: null };
              const returnedPatch = clone(patch);
              if (Object.hasOwn(returnedPatch, "one_link_updated_at")) {
                returnedPatch.one_link_updated_at = normalizeRevision(
                  returnedPatch.one_link_updated_at,
                );
              }
              const returnedProfile = {
                ...state.profile,
                ...returnedPatch,
                ...(outcome.returnedProfile || {}),
              };
              if (outcome.apply !== false) state.profile = clone(returnedProfile);
              if (outcome.afterApply) outcome.afterApply(state);
              return { data: clone(returnedProfile), error: null };
            },
          };
          return builder;
        },
      };
    },
  };
  return { supabase, state };
}

const mutationDependencies = (fake, overrides = {}) => ({
  authenticate: async () => ({ userId: "user_owner" }),
  supabase: fake.supabase,
  cloudinary: null,
  findOwnerProfile: async (_supabase, ownerUserId) => ({
    profile:
      fake.state.profile.clerk_id === ownerUserId
        ? clone(fake.state.profile)
        : null,
    failed: false,
  }),
  findProfileByUsername: async (_supabase, username) => ({
    profile:
      fake.state.profile.one_link_username === username ||
      (fake.state.profile.one_link_username === null &&
        fake.state.profile.username === username)
        ? clone(fake.state.profile)
        : null,
    failed: false,
  }),
  nextRevision: () => "2026-08-02T10:11:12.123Z",
  logger: { error() {} },
  ...overrides,
});

test("legacy publication is contextual while a genuinely fresh profile is a draft", () => {
  const legacy = parseOneLinkProfileBio(
    JSON.stringify({ bio: "Legacy", onelink: {} }),
  );
  assert.equal(legacy.hasLegacyOneLinkConfiguration, true);
  assert.equal(legacy.settings.published, true);
  assert.equal(
    parseOneLinkProfileBio(
      JSON.stringify({ bio: "Legacy", onelink: { published: false } }),
    ).settings.published,
    false,
  );
  assert.equal(
    parseOneLinkProfileBio(
      JSON.stringify({ bio: "Legacy", onelink: { published: true } }),
    ).settings.published,
    true,
  );
  assert.equal(parseOneLinkProfileBio("Fresh biography").settings.published, false);
  assert.equal(
    toOwnerResponse(
      makeProfile({
        bio: "Fresh biography",
        one_link_username: null,
        one_link_display_name: null,
        one_link_biography: null,
        one_link_settings: null,
        one_link_updated_at: null,
      }),
    ).settings.published,
    false,
  );
  assert.equal(
    normalizeOneLinkSettings({}, { publicationContext: "fresh" }).published,
    false,
  );
  assert.equal(
    toOwnerResponse(makeProfile({ one_link_settings: { published: true } }))
      .settings.published,
    true,
  );
  assert.equal(
    toOwnerResponse(makeProfile({ one_link_settings: { published: false } }))
      .settings.published,
    false,
  );
});

test("legacy public pages remain available and explicit unpublishing remains private", async () => {
  const legacy = makeProfile({
    bio: JSON.stringify({ bio: "Legacy", onelink: { theme: "dark-twilight" } }),
    one_link_username: null,
    one_link_display_name: null,
    one_link_biography: null,
    one_link_settings: null,
    one_link_updated_at: null,
  });
  const request = {
    method: "GET",
    headers: { host: "localhost" },
    query: { username: "creator" },
    url: "/api/onelink?action=public&username=creator",
  };
  const liveResponse = makeResponse();
  await handlePublic(request, liveResponse, {
    supabase: {},
    findProfileByUsername: async () => ({ profile: legacy, failed: false }),
  });
  assert.equal(liveResponse.statusCode, 200);
  assert.equal(liveResponse.body.success, true);

  legacy.bio = JSON.stringify({
    bio: "Legacy",
    onelink: { theme: "dark-twilight", published: false },
  });
  const privateResponse = makeResponse();
  await handlePublic(request, privateResponse, {
    supabase: {},
    findProfileByUsername: async () => ({ profile: legacy, failed: false }),
  });
  assert.equal(privateResponse.statusCode, 403);
  assert.equal(privateResponse.body.code, "ONELINK_UNPUBLISHED");
});

test("independent One Link accepts only exact revision values", () => {
  assert.equal(validateOneLinkSavePayload(validDraft()).expectedRevision, null);
  const revision = "2026-08-02T10:11:12.123Z";
  assert.equal(
    validateOneLinkSavePayload(
      validDraft({ expectedRevision: revision }),
    ).expectedRevision,
    revision,
  );
  assert.throws(
    () => validateOneLinkSavePayload(validDraft({ expectedRevision: undefined })),
    /revision is invalid/i,
  );
});

test("revision helpers distinguish null, exact values, database errors, and zero rows", () => {
  assert.equal(revisionMatches(null, null), true);
  assert.equal(revisionMatches(null, "revision"), false);
  assert.equal(revisionMatches("revision", "revision"), true);
  assert.equal(revisionMatches("revision", "other"), false);
  const calls = [];
  const query = {
    is(...args) {
      calls.push(["is", ...args]);
      return this;
    },
    eq(...args) {
      calls.push(["eq", ...args]);
      return this;
    },
  };
  withRevisionMatch(query, null);
  withRevisionMatch(query, "revision");
  assert.deepEqual(calls, [
    ["is", "one_link_updated_at", null],
    ["eq", "one_link_updated_at", "revision"],
  ]);
  assert.equal(classifyOneLinkUpdateResult(null, new Error("db")).kind, "database_error");
  assert.equal(classifyOneLinkUpdateResult(null, null).kind, "zero_rows");
  assert.deepEqual(
    classifyOneLinkUpdateResult(
      { one_link_updated_at: "2026-08-02T10:11:12.123+00:00" },
      null,
    ),
    { kind: "success", revision: "2026-08-02T10:11:12.123+00:00" },
  );
});

test("unpublish payload is strict and revision-only", () => {
  assert.deepEqual(validateOneLinkUnpublishPayload({ expectedRevision: null }), {
    expectedRevision: null,
  });
  assert.throws(
    () =>
      validateOneLinkUnpublishPayload({
        expectedRevision: null,
        settings: { published: false },
      }),
    /unsupported field/i,
  );
});

test("social URLs normalize safely and duplicate normalized URLs are rejected", () => {
  assert.equal(normalizeExternalUrl("example.com/me"), "https://example.com/me");
  assert.equal(normalizeExternalUrl("https://user:pass@example.com"), null);
  assert.equal(normalizeExternalUrl("javascript:alert(1)"), null);
  const draft = validDraft();
  draft.settings.socials = [
    { id: "social-one", platform: "x", url: "example.com/me", enabled: true },
    {
      id: "social-two",
      platform: "website",
      url: "https://example.com/me",
      enabled: true,
    },
  ];
  assert.throws(() => validateOneLinkSavePayload(draft), /different URL/i);
});

test("save preserves stored publication and ignores a malicious publication value", async () => {
  for (const published of [true, false]) {
    const revision = "2026-08-02T09:00:00.000+00:00";
    const fake = makeFakeSupabase(
      makeProfile({
        one_link_settings: normalizeOneLinkSettings({ published }),
        one_link_updated_at: revision,
      }),
    );
    const response = makeResponse();
    const payload = validDraft({ expectedRevision: revision });
    payload.settings.published = !published;
    await handleDraftMutation(
      makeRequest(payload),
      response,
      "save",
      mutationDependencies(fake),
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.published, published);
    assert.equal(fake.state.profile.one_link_settings.published, published);
  }
});

test("database-normalized revision is returned and required by the next mutation", async () => {
  const original = "2026-08-02T09:00:00.000+00:00";
  const normalized = "2026-08-02T10:11:12.123+00:00";
  const fake = makeFakeSupabase(makeProfile({ one_link_updated_at: original }), {
    normalizeRevision: (value) =>
      value === "2026-08-02T10:11:12.123Z" ? normalized : value,
  });
  const dependencies = mutationDependencies(fake);
  const first = makeResponse();
  await handleDraftMutation(
    makeRequest(validDraft({ expectedRevision: original })),
    first,
    "save",
    dependencies,
  );
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.revision, normalized);
  assert.equal(fake.state.profile.one_link_updated_at, normalized);

  const stale = makeResponse();
  await handleDraftMutation(
    makeRequest(validDraft({ expectedRevision: "2026-08-02T10:11:12.123Z" })),
    stale,
    "save",
    dependencies,
  );
  assert.equal(stale.statusCode, 409);

  const next = makeResponse();
  await handleDraftMutation(
    makeRequest(validDraft({ expectedRevision: normalized })),
    next,
    "save",
    dependencies,
  );
  assert.equal(next.statusCode, 200);
  assert.equal(fake.state.calls.at(-1).filters.at(-1).value, normalized);
});

test("database update errors are 503 while genuine conditional zero rows are 409", async () => {
  const revision = "2026-08-02T09:00:00.000+00:00";
  const failed = makeFakeSupabase(makeProfile(), {
    outcomes: [{ error: { code: "DATABASE_UNAVAILABLE" } }],
  });
  const failedResponse = makeResponse();
  await handleDraftMutation(
    makeRequest(validDraft({ expectedRevision: revision })),
    failedResponse,
    "save",
    mutationDependencies(failed),
  );
  assert.equal(failedResponse.statusCode, 503);
  assert.equal(failedResponse.body.code, "ONELINK_SAVE_FAILED");

  const conflicted = makeFakeSupabase(makeProfile(), {
    outcomes: [{ zeroRows: true }],
  });
  const before = clone(conflicted.state.profile);
  const conflictResponse = makeResponse();
  await handleDraftMutation(
    makeRequest(
      validDraft({
        expectedRevision: revision,
        biography: "Must not be persisted",
      }),
    ),
    conflictResponse,
    "save",
    mutationDependencies(conflicted),
  );
  assert.equal(conflictResponse.statusCode, 409);
  assert.equal(conflictResponse.body.code, "ONELINK_REVISION_CONFLICT");
  assert.deepEqual(conflicted.state.profile, before);
});

test("stale save, publish, and unpublish do not alter content or publication", async () => {
  for (const action of ["save", "publish", "unpublish"]) {
    const staleRevision = "2026-08-02T08:00:00.000+00:00";
    const fake = makeFakeSupabase(
      makeProfile({
        one_link_settings: normalizeOneLinkSettings({ published: true }),
      }),
    );
    const before = clone(fake.state.profile);
    const response = makeResponse();
    const request =
      action === "unpublish"
        ? makeRequest({ expectedRevision: staleRevision })
        : makeRequest(
            validDraft({
              expectedRevision: staleRevision,
              biography: "Stale content",
            }),
          );
    if (action === "unpublish") {
      await handleUnpublish(request, response, mutationDependencies(fake));
    } else {
      await handleDraftMutation(
        request,
        response,
        action,
        mutationDependencies(fake),
      );
    }
    assert.equal(response.statusCode, 409);
    assert.deepEqual(fake.state.profile, before);
    assert.equal(fake.state.calls.length, 0);
  }
});

test("publish rejects a wrong public owner before writing", async () => {
  const fake = makeFakeSupabase(makeProfile());
  const response = makeResponse();
  await handleDraftMutation(
    makeRequest(validDraft({ expectedRevision: fake.state.profile.one_link_updated_at })),
    response,
    "publish",
    mutationDependencies(fake, {
      findProfileByUsername: async () => ({
        profile: makeProfile({ clerk_id: "user_other" }),
        failed: false,
      }),
    }),
  );
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "ONELINK_PUBLIC_OWNER_MISMATCH");
  assert.equal(fake.state.calls.length, 0);
});

test("explicit publish is successful only after the persisted public owner verifies", async () => {
  const fake = makeFakeSupabase(makeProfile());
  let publicLookups = 0;
  const response = makeResponse();
  await handleDraftMutation(
    makeRequest(validDraft({ expectedRevision: fake.state.profile.one_link_updated_at })),
    response,
    "publish",
    mutationDependencies(fake, {
      findProfileByUsername: async () => {
        publicLookups += 1;
        return { profile: clone(fake.state.profile), failed: false };
      },
    }),
  );
  assert.equal(publicLookups, 2);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.published, true);
  assert.equal(response.body.liveConfirmed, true);
  assert.equal(fake.state.profile.one_link_settings.published, true);
});

test("explicit unpublish preserves content, verifies false, and returns persisted revision", async () => {
  const revision = "2026-08-02T09:00:00.000+00:00";
  const normalized = "2026-08-02T10:11:12.123+00:00";
  const initial = makeProfile({
    one_link_biography: "Keep this content",
    one_link_settings: normalizeOneLinkSettings({ published: true }),
  });
  const fake = makeFakeSupabase(initial, {
    normalizeRevision: () => normalized,
  });
  const response = makeResponse();
  await handleUnpublish(
    makeRequest({ expectedRevision: revision }),
    response,
    mutationDependencies(fake),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.revision, normalized);
  assert.equal(response.body.published, false);
  assert.equal(response.body.liveConfirmed, false);
  assert.equal(fake.state.profile.one_link_biography, "Keep this content");
  assert.equal(fake.state.profile.one_link_settings.published, false);
});

test("unpublish database errors are not misclassified as conflicts", async () => {
  const fake = makeFakeSupabase(
    makeProfile({ one_link_settings: normalizeOneLinkSettings({ published: true }) }),
    { outcomes: [{ error: { code: "DATABASE_UNAVAILABLE" } }] },
  );
  const response = makeResponse();
  await handleUnpublish(
    makeRequest({ expectedRevision: fake.state.profile.one_link_updated_at }),
    response,
    mutationDependencies(fake),
  );
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "ONELINK_UNPUBLISH_FAILED");
});

test("post-verification failure rolls back using the exact persisted publish revision", async () => {
  const persistedPublishRevision = "2026-08-02T10:11:12.123+00:00";
  const rollbackRevision = "2026-08-02T10:12:00.000+00:00";
  const fake = makeFakeSupabase(makeProfile(), {
    normalizeRevision: (value) =>
      value === "publish-attempt"
        ? persistedPublishRevision
        : value === "rollback-attempt"
          ? rollbackRevision
          : value,
  });
  const revisions = ["publish-attempt", "rollback-attempt"];
  let lookups = 0;
  const response = makeResponse();
  await handleDraftMutation(
    makeRequest(validDraft({ expectedRevision: fake.state.profile.one_link_updated_at })),
    response,
    "publish",
    mutationDependencies(fake, {
      nextRevision: () => revisions.shift(),
      findProfileByUsername: async () => {
        lookups += 1;
        return lookups === 1
          ? { profile: clone(fake.state.profile), failed: false }
          : { profile: null, failed: false };
      },
    }),
  );
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "ONELINK_PUBLISH_VERIFICATION_FAILED");
  assert.notEqual(response.body.liveConfirmed, true);
  assert.equal(fake.state.profile.one_link_settings.published, false);
  assert.equal(fake.state.profile.one_link_updated_at, rollbackRevision);
  assert.deepEqual(fake.state.calls[1].filters.at(-1), {
    operator: "eq",
    column: "one_link_updated_at",
    value: persistedPublishRevision,
  });
});

test("rollback database errors, zero rows, and a reread still showing live are unconfirmed", async () => {
  for (const [rollbackOutcome, expectedCategory] of [
    [{ error: { code: "DATABASE_UNAVAILABLE" } }, "database_error"],
    [{ zeroRows: true }, "zero_rows"],
    [{ apply: false }, "owner_still_published"],
  ]) {
    const fake = makeFakeSupabase(makeProfile(), {
      outcomes: [{}, rollbackOutcome],
    });
    let lookups = 0;
    const logs = [];
    const response = makeResponse();
    await handleDraftMutation(
      makeRequest(validDraft({ expectedRevision: fake.state.profile.one_link_updated_at })),
      response,
      "publish",
      mutationDependencies(fake, {
        nextRevision: (() => {
          const revisions = ["publish-revision", "rollback-revision"];
          return () => revisions.shift();
        })(),
        findProfileByUsername: async () => {
          lookups += 1;
          return lookups === 1
            ? { profile: clone(fake.state.profile), failed: false }
            : { profile: null, failed: false };
        },
        logger: { error: (...args) => logs.push(args) },
      }),
    );
    assert.equal(response.statusCode, 503);
    assert.equal(
      response.body.code,
      "ONELINK_PUBLISH_FAIL_CLOSED_UNCONFIRMED",
    );
    assert.notEqual(response.body.liveConfirmed, true);
    assert.equal(logs.length, 1);
    assert.deepEqual(Object.keys(logs[0][1]).sort(), [
      "attemptedRevision",
      "code",
      "ownerIdHash",
      "rollbackErrorCategory",
      "username",
    ]);
    assert.equal(logs[0][1].rollbackErrorCategory, expectedCategory);
    assert.equal(logs[0][1].attemptedRevision, "publish-revision");
  }
});

test("editor uses explicit publication controls and View Live never saves", async () => {
  const editor = await readFile(
    rootFile("src/components/OneLinkEditor.tsx"),
    "utf8",
  );
  assert.doesNotMatch(editor, /Save & Publish/);
  assert.doesNotMatch(editor, /label="Published"/);
  assert.match(editor, /Publish One Link/);
  assert.match(editor, /Unpublish One Link/);
  assert.match(editor, /Reload latest version/);
  assert.match(editor, /Your One Link is live\./);
  const viewLive = editor.slice(
    editor.indexOf("const viewLive"),
    editor.indexOf("const goBack"),
  );
  assert.doesNotMatch(viewLive, /saveChanges|onMutate/);
  assert.match(viewLive, /verifyPublicPage/);
  assert.match(viewLive, /window\.open\("about:blank", "_blank"\)/);
  assert.match(viewLive, /liveWindow\.opener = null/);
});

test("typed social registry has the canonical 15 platforms and aliases", async () => {
  const registry = await readFile(
    rootFile("src/utils/onelinkPlatforms.tsx"),
    "utf8",
  );
  const expected = [
    "instagram",
    "tiktok",
    "x",
    "facebook",
    "linkedin",
    "youtube",
    "whatsapp",
    "telegram",
    "snapchat",
    "github",
    "discord",
    "spotify",
    "behance",
    "dribbble",
    "website",
  ];
  const idBlock = registry.slice(
    registry.indexOf("ONE_LINK_PLATFORM_IDS"),
    registry.indexOf("] as const"),
  );
  assert.deepEqual(
    [...idBlock.matchAll(/"([a-z]+)"/g)].map((match) => match[1]),
    expected,
  );
  assert.match(registry, /twitter: "x"/);
  assert.match(registry, /web: "website"/);
  assert.match(registry, /site: "website"/);
  assert.match(registry, /getOneLinkPlatform\(value\)\?\.icon \|\| WebsiteIcon/);
});

test("social picker is populated, accessible, and does not create on open", async () => {
  const editor = await readFile(
    rootFile("src/components/OneLinkEditor.tsx"),
    "utf8",
  );
  assert.doesNotMatch(editor, /<datalist/);
  assert.match(editor, /aria-haspopup="listbox"/);
  assert.match(editor, /role="listbox"/);
  assert.match(editor, /ONE_LINK_PLATFORMS\.map/);
  assert.match(editor, /event\.key === "Escape"/);
  assert.match(editor, /addSocialButtonRef\.current\?\.focus/);
  assert.match(editor, /socialUrlRefs\.current\.get\(id\)\?\.focus/);
  const toggle = editor.match(/onClick=\{\(\) => setSocialPickerOpen\(\(open\) => !open\)\}/g);
  assert.equal(toggle?.length, 1);
});
