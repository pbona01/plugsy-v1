import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeExternalUrl,
  normalizeOneLinkSettings,
  validateOneLinkSavePayload,
  validateOneLinkUnpublishPayload,
} from "../shared/onelink.js";

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

test("independent One Link defaults to draft and only accepts exact revision values", () => {
  assert.equal(normalizeOneLinkSettings({}).published, false);
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

test("server mutations are explicit, revision-conditional, and fail closed", async () => {
  const source = await readFile(rootFile("api/onelink.js"), "utf8");
  assert.match(source, /action === "save"/);
  assert.match(source, /action === "publish"/);
  assert.match(source, /action === "unpublish"/);
  assert.match(source, /ONELINK_REVISION_CONFLICT/);
  assert.match(source, /query\.is\("one_link_updated_at", null\)/);
  assert.match(source, /query\.eq\("one_link_updated_at", revision\)/);
  assert.match(source, /ONELINK_PUBLIC_OWNER_MISMATCH/);
  assert.match(source, /ONELINK_PUBLISH_VERIFICATION_FAILED/);
  assert.match(source, /published:\s*action === "publish"\s*\? true\s*:\s*currentOwner\.settings\.published/s);
  assert.match(source, /published: false/);
  assert.match(source, /revision: result\.profile\.one_link_updated_at \?\? null/);
  assert.match(
    source,
    /else if \(persistedSettings\.published\) \{\s*liveConfirmed = await publicationConfirmation\(supabase, updated\)/s,
  );
  assert.match(
    source,
    /const verifiedOwner = await findOwnerProfile\(supabase, actor\.userId\)/,
  );
  assert.doesNotMatch(source, /clerk_id:\s*actor\.userId/);
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
