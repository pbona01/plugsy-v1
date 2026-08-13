import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import handler from "../api/link-preview.js";
import { normalizeOneLinkSettings } from "../shared/onelink.js";

const makeResponse = () => ({
  statusCode: 200,
  headers: {},
  body: "",
  setHeader(key, value) {
    this.headers[key.toLowerCase()] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
});

const makeRequest = (query) => ({
  method: "GET",
  url: `/api/link-preview?${new URLSearchParams(query)}`,
  query,
  headers: { host: "www.plugsy.ng", "x-forwarded-proto": "https" },
});

const profile = {
  clerk_id: "user_owner",
  username: "creator",
  full_name: "Creator Name",
  profile_pic_url: null,
  image_url: null,
  bio: "",
  one_link_username: "creator",
  one_link_display_name: "Creator Name",
  one_link_biography: "Creator One Link bio <script>alert(1)</script>",
  one_link_avatar_url: "https://images.example/avatar.png",
  one_link_avatar_public_id: null,
  one_link_wallpaper_url: null,
  one_link_wallpaper_public_id: null,
  one_link_wallpaper_text_mode: "light",
  one_link_settings: normalizeOneLinkSettings({
    published: true,
    seoTitle: "Creator Custom One Link",
    seoDescription: "Creator custom social preview description",
  }),
  one_link_updated_at: "2026-08-02T09:00:00.000+00:00",
};

function fakeSupabase() {
  return {
    from(table) {
      const state = { table, value: "" };
      const builder = {
        select() {
          return builder;
        },
        eq(_column, value) {
          state.value = value;
          return builder;
        },
        is() {
          return builder;
        },
        ilike(_column, value) {
          state.value = value;
          return builder;
        },
        async maybeSingle() {
          if (state.table === "profiles" && state.value === "creator") {
            return { data: profile, error: null };
          }
          if (state.table === "vp_portfolios" && state.value === "portfolio-slug") {
            return {
              data: {
                slug: "portfolio-slug",
                status: "published",
                full_name: "Portfolio Owner",
                username: "portfolio_owner",
                tagline: "Motion designer and visual storyteller",
                bio_text: "",
                longBio: "",
                profile_image_url: "https://images.example/portfolio.png",
                category: "design",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
}

test("crawler rewrites are configured for OneLink and portfolio URLs", async () => {
  const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(vercel, /"source": "\/one\/:username"/);
  assert.match(vercel, /"source": "\/u\/:username"/);
  assert.match(vercel, /"source": "\/vp\/:slug"/);
  assert.match(vercel, /"destination": "\/api\/link-preview\?kind=onelink&username=:username"/);
  assert.match(vercel, /"destination": "\/api\/link-preview\?kind=portfolio&slug=:slug"/);
  assert.match(vercel, /user-agent/);
});

test("OneLink preview uses creator-owned metadata", async () => {
  const res = makeResponse();
  await handler(makeRequest({ kind: "onelink", username: "creator" }), res, {
    supabase: fakeSupabase(),
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Creator Custom One Link/);
  assert.match(res.body, /Creator custom social preview description/);
  assert.match(res.body, /https:\/\/images\.example\/avatar\.png/);
  assert.match(res.body, /https:\/\/www\.plugsy\.ng\/one\/creator/);
  assert.doesNotMatch(res.body, /<script/);
});

test("portfolio preview uses published portfolio details", async () => {
  const res = makeResponse();
  await handler(makeRequest({ kind: "portfolio", slug: "portfolio-slug" }), res, {
    supabase: fakeSupabase(),
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Portfolio Owner \| Portfolio/);
  assert.match(res.body, /Motion designer and visual storyteller/);
  assert.match(res.body, /https:\/\/images\.example\/portfolio\.png/);
  assert.match(res.body, /https:\/\/www\.plugsy\.ng\/vp\/portfolio-slug/);
});
