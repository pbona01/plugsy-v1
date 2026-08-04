import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildOneLinkSocialUrl, findDuplicateOneLinkSocialPlatforms, findDuplicateOneLinkSocialUrls, getOneLinkSocialPreset, normalizeOneLinkSocialInput, parseOneLinkSocialUrl, supportsOneLinkSocialHandle } from "../shared/onelinkSocialPresets.js";
import { normalizeExternalUrl } from "../shared/onelink.js";

const built = (platform, input) => buildOneLinkSocialUrl(platform, input).url;

test("social presets generate supported destinations", () => {
  assert.equal(built("instagram", "@@peter"), "https://instagram.com/peter");
  assert.equal(built("tiktok", "@peter"), "https://tiktok.com/@peter");
  assert.equal(built("x", "@peter"), "https://x.com/peter");
  assert.equal(built("facebook", "peter"), "https://facebook.com/peter");
  assert.equal(built("linkedin", "peter-smith"), "https://linkedin.com/in/peter-smith");
  assert.equal(built("youtube", "@peter"), "https://youtube.com/@peter");
  assert.equal(built("telegram", "@peter"), "https://t.me/peter");
  assert.equal(built("snapchat", "peter"), "https://snapchat.com/add/peter");
  assert.equal(built("github", "peter"), "https://github.com/peter");
  assert.equal(built("behance", "peter"), "https://behance.net/peter");
  assert.equal(built("dribbble", "peter"), "https://dribbble.com/peter");
});

test("WhatsApp normalizes common phone formatting and bounds digits", () => {
  assert.equal(built("whatsapp", "+234 801 234 5678"), "https://wa.me/2348012345678");
  assert.equal(built("whatsapp", "(234)-801-234-5678"), "https://wa.me/2348012345678");
  assert.equal(buildOneLinkSocialUrl("whatsapp", "1234567").code, "WHATSAPP_NUMBER_INVALID");
  assert.equal(buildOneLinkSocialUrl("whatsapp", "1234567890123456").code, "WHATSAPP_NUMBER_INVALID");
});

test("full URL platforms and unknown platforms are safe", () => {
  for (const platform of ["discord", "spotify", "website"]) assert.equal(supportsOneLinkSocialHandle(platform), false);
  assert.equal(getOneLinkSocialPreset("unknown"), null);
  assert.equal(buildOneLinkSocialUrl("unknown", "peter").valid, false);
});

test("preset validation rejects injection, controls, and empty values", () => {
  for (const value of ["", "peter/name", "peter\\name", "peter?x", "peter#x", "peter:x", "peter name", "peter\u0001"]) {
    assert.equal(normalizeOneLinkSocialInput("instagram", value).valid, false);
  }
});

test("legacy platform URLs parse into preset input when exact formats match", () => {
  assert.equal(parseOneLinkSocialUrl("x", "https://twitter.com/peter"), "peter");
  assert.equal(parseOneLinkSocialUrl("instagram", "https://www.instagram.com/peter/"), "peter");
  assert.equal(parseOneLinkSocialUrl("linkedin", "https://linkedin.com/in/peter-smith"), "peter-smith");
  assert.equal(parseOneLinkSocialUrl("youtube", "https://youtube.com/@peter"), "peter");
  assert.equal(parseOneLinkSocialUrl("telegram", "https://telegram.me/peter"), "peter");
  assert.equal(parseOneLinkSocialUrl("whatsapp", "https://api.whatsapp.com/send?phone=2348012345678"), "2348012345678");
});

test("unrelated paths remain full URL mode and generated URLs pass validation", () => {
  assert.equal(parseOneLinkSocialUrl("linkedin", "https://linkedin.com/company/plugsy"), null);
  assert.equal(parseOneLinkSocialUrl("instagram", "https://example.com/peter"), null);
  for (const [platform, input] of [["instagram", "peter"], ["whatsapp", "+234 801 234 5678"], ["youtube", "@peter"]]) {
    const result = buildOneLinkSocialUrl(platform, input);
    assert.equal(Boolean(normalizeExternalUrl(result.url)), true);
    assert.equal(parseOneLinkSocialUrl(platform, result.url), normalizeOneLinkSocialInput(platform, input).value);
  }
});

test("editor keeps transient preset state out of persisted settings and blocks duplicate destinations", async () => {
  const editor = await readFile(new URL("../src/components/OneLinkEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /SocialEditorState/); assert.match(editor, /socialEditorState/);
  assert.match(editor, /duplicateSocialUrls/); assert.match(editor, /socialSaveBlocked/);
  assert.match(editor, /expectedRevision: revision/);
  assert.doesNotMatch(editor, /settings\.socials\.map\([^)]*editor/);
});

test("editor picker disables added platforms and preserves full URL fallback", async () => {
  const editor = await readFile(new URL("../src/components/OneLinkEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /alreadyAdded/); assert.match(editor, /disabled=\{alreadyAdded\}/);
  assert.match(editor, /Paste full URL instead/); assert.match(editor, /selectExistingSocialPlatform/);
});

test("Instagram strips multiple leading at signs", () => assert.equal(built("instagram", "@@@alice"), "https://instagram.com/alice"));
test("TikTok generated path retains its required at sign", () => assert.equal(built("tiktok", "alice"), "https://tiktok.com/@alice"));
test("X uses the x.com host", () => assert.equal(built("x", "alice"), "https://x.com/alice"));
test("Facebook uses the profile username path", () => assert.equal(built("facebook", "alice"), "https://facebook.com/alice"));
test("LinkedIn rejects unrelated full paths as slugs", () => assert.equal(buildOneLinkSocialUrl("linkedin", "company/plugsy").valid, false));
test("YouTube parses handle URLs", () => assert.equal(parseOneLinkSocialUrl("youtube", "https://www.youtube.com/@alice/"), "alice"));
test("WhatsApp accepts parentheses and dashes", () => assert.equal(normalizeOneLinkSocialInput("whatsapp", "(234) 801-234-5678").value, "2348012345678"));
test("WhatsApp rejects letters", () => assert.equal(buildOneLinkSocialUrl("whatsapp", "+234 abc").valid, false));
test("Telegram removes a leading at sign", () => assert.equal(normalizeOneLinkSocialInput("telegram", "@alice").value, "alice"));
test("Snapchat uses the add path", () => assert.equal(built("snapchat", "alice"), "https://snapchat.com/add/alice"));
test("GitHub uses the profile path", () => assert.equal(built("github", "alice"), "https://github.com/alice"));
test("Behance uses the profile path", () => assert.equal(built("behance", "alice"), "https://behance.net/alice"));
test("Dribbble uses the profile path", () => assert.equal(built("dribbble", "alice"), "https://dribbble.com/alice"));
test("Discord does not invent a destination", () => assert.equal(buildOneLinkSocialUrl("discord", "alice").url, ""));
test("Spotify does not invent a destination", () => assert.equal(buildOneLinkSocialUrl("spotify", "alice").valid, false));
test("Website is full URL only", () => assert.equal(supportsOneLinkSocialHandle("website"), false));
test("control characters are rejected", () => assert.equal(buildOneLinkSocialUrl("github", "alice\n").valid, false));
test("query and fragment injection are rejected", () => { assert.equal(buildOneLinkSocialUrl("github", "alice?x=1").valid, false); assert.equal(buildOneLinkSocialUrl("github", "alice#x").valid, false); });
test("generated links round trip through the parser", () => { for (const platform of ["instagram", "tiktok", "x", "facebook", "linkedin", "youtube", "telegram", "snapchat", "github", "behance", "dribbble"]) assert.equal(parseOneLinkSocialUrl(platform, built(platform, "alice")), "alice"); });
test("generated WhatsApp links round trip", () => assert.equal(parseOneLinkSocialUrl("whatsapp", built("whatsapp", "+234 801 234 5678")), "2348012345678"));
test("invalid builder results do not expose unsafe URLs", () => { const result = buildOneLinkSocialUrl("instagram", "https://evil.example"); assert.equal(result.valid, false); assert.equal(result.url, ""); });
test("preset metadata has labels for every handle platform", () => { for (const platform of ["instagram", "tiktok", "x", "facebook", "linkedin", "youtube", "whatsapp", "telegram", "snapchat", "github", "behance", "dribbble"]) assert.ok(getOneLinkSocialPreset(platform)?.label); });
test("duplicate platform and normalized destination helpers detect conflicts", () => {
  assert.deepEqual([...findDuplicateOneLinkSocialPlatforms([{ platform: "instagram" }, { platform: "instagram" }, { platform: "github" }])], ["instagram"]);
  assert.deepEqual([...findDuplicateOneLinkSocialUrls([{ url: "https://instagram.com/alice" }, { url: " https://instagram.com/alice " }, { url: "https://github.com/alice" }])], ["https://instagram.com/alice"]);
});
