import {
  normalizeExternalUrl,
  normalizeOneLinkOwnerProfile,
  normalizeOneLinkUsername,
} from "../shared/onelink.js";

const DEFAULT_IMAGE = "https://i.postimg.cc/4dHFwnzr/IMG-1987.png";
const DEFAULT_TITLE = "Plugsy";
const DEFAULT_DESCRIPTION = "Smart, lower-cost access for creators and students.";

const text = (value) => String(value || "").trim();
const truncate = (value, length) => {
  const clean = text(value).replace(/\s+/g, " ");
  return clean.length > length ? `${clean.slice(0, length - 1).trim()}...` : clean;
};
const escapeHtml = (value) =>
  text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const absoluteUrl = (req, path) => {
  const host = text(req.headers?.["x-forwarded-host"] || req.headers?.host) || "www.plugsy.ng";
  const proto = text(req.headers?.["x-forwarded-proto"]) || "https";
  return `${proto}://${host}${path}`;
};

function renderHtml({ title, description, image, url, type }) {
  const safeTitle = escapeHtml(title || DEFAULT_TITLE);
  const safeDescription = escapeHtml(description || DEFAULT_DESCRIPTION);
  const safeImage = escapeHtml(normalizeExternalUrl(image) || DEFAULT_IMAGE);
  const safeUrl = escapeHtml(url || "https://www.plugsy.ng");
  const safeType = escapeHtml(type || "website");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${safeUrl}">
  <meta property="og:type" content="${safeType}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:site_name" content="Plugsy">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImage}">
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <p><a href="${safeUrl}">Open this page</a></p>
  </main>
</body>
</html>`;
}

function sendError(res, status) {
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  return res.status(status).send(renderHtml({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    image: DEFAULT_IMAGE,
    url: "https://www.plugsy.ng",
    type: "website",
  }));
}

async function getServiceClient(res, dependencies = {}) {
  if (dependencies.supabase) return dependencies.supabase;
  const supabaseUrl = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    sendError(res, 503);
    return null;
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function onelinkPreview(req, res, username, dependencies = {}) {
  const cleanUsername = normalizeOneLinkUsername(username);
  if (!cleanUsername) return sendError(res, 404);
  const supabase = await getServiceClient(res, dependencies);
  if (!supabase) return;

  const columns =
    "clerk_id,username,full_name,profile_pic_url,image_url,bio,one_link_username,one_link_display_name,one_link_biography,one_link_avatar_url,one_link_avatar_public_id,one_link_wallpaper_url,one_link_wallpaper_public_id,one_link_wallpaper_text_mode,one_link_settings,one_link_updated_at";
  const explicit = await supabase
    .from("profiles")
    .select(columns)
    .eq("one_link_username", cleanUsername)
    .maybeSingle();
  if (explicit.error) return sendError(res, 503);
  let profile = explicit.data;
  if (!profile) {
    const fallback = await supabase
      .from("profiles")
      .select(columns)
      .is("one_link_username", null)
      .ilike("username", cleanUsername.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();
    if (fallback.error) return sendError(res, 503);
    profile = fallback.data;
  }
  if (!profile) return sendError(res, 404);

  const owner = normalizeOneLinkOwnerProfile(profile);
  if (!owner.username || !owner.settings.published) return sendError(res, 404);
  const displayName = owner.displayName || `@${owner.username}`;
  const title = truncate(owner.settings.seoTitle || `${displayName} | One Link`, 90);
  const description = truncate(
    owner.settings.seoDescription || owner.biography || `Visit ${displayName}'s One Link.`,
    180,
  );
  return res.status(200).send(renderHtml({
    title,
    description,
    image: owner.imageUrl || owner.wallpaperUrl || DEFAULT_IMAGE,
    url: absoluteUrl(req, `/one/${encodeURIComponent(owner.username)}`),
    type: "profile",
  }));
}

async function portfolioPreview(req, res, slug, dependencies = {}) {
  const cleanSlug = text(slug).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(cleanSlug)) return sendError(res, 404);
  const supabase = await getServiceClient(res, dependencies);
  if (!supabase) return;

  const { data: portfolio, error } = await supabase
    .from("vp_portfolios")
    .select("*")
    .eq("slug", cleanSlug)
    .maybeSingle();
  if (error) return sendError(res, 503);
  if (!portfolio || portfolio.status !== "published") return sendError(res, 404);

  const displayName = text(portfolio.full_name || portfolio.username) || "Portfolio";
  const category = text(portfolio.category);
  const title = truncate(`${displayName} | Portfolio`, 90);
  const description = truncate(
    portfolio.tagline ||
      portfolio.bio_text ||
      portfolio.longBio ||
      (category ? `${displayName}'s ${category} portfolio.` : `Check out ${displayName}'s portfolio.`),
    180,
  );
  const image =
    portfolio.profile_image_url ||
    portfolio.avatarUrl ||
    portfolio.profileImage ||
    portfolio.profile_image ||
    portfolio.bio_graphic_url ||
    DEFAULT_IMAGE;

  return res.status(200).send(renderHtml({
    title,
    description,
    image,
    url: absoluteUrl(req, `/vp/${encodeURIComponent(portfolio.slug)}`),
    type: "profile",
  }));
}

export default async function handler(req, res, dependencies = {}) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405);

  const url = new URL(req.url || "/", `https://${req.headers?.host || "www.plugsy.ng"}`);
  const kind = text(req.query?.kind || url.searchParams.get("kind")).toLowerCase();
  if (kind === "onelink") {
    return onelinkPreview(req, res, req.query?.username || url.searchParams.get("username"), dependencies);
  }
  if (kind === "portfolio") {
    return portfolioPreview(req, res, req.query?.slug || url.searchParams.get("slug"), dependencies);
  }
  return sendError(res, 404);
}
