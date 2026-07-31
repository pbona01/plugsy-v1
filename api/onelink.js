import { createClient } from "@supabase/supabase-js";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";
import {
  ONE_LINK_LIMITS,
  normalizeExternalUrl,
  normalizeOneLinkSettings,
  normalizeOneLinkUsername,
  OneLinkValidationError,
  parseOneLinkProfileBio,
  serializeOneLinkProfileBio,
  validateOneLinkSavePayload,
} from "../shared/onelink.js";

const PROFILE_COLUMNS =
  "clerk_id,username,full_name,profile_pic_url,image_url,bio";
const escapeLikePattern = (value) =>
  value.replace(/[\\%_]/g, "\\$&");

function sendError(res, status, code, error) {
  return res.status(status).json({
    success: false,
    code,
    error,
  });
}

function getServiceClient(res) {
  const supabaseUrl = String(
    process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "",
  ).trim();
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();

  if (!supabaseUrl || !serviceRoleKey) {
    sendError(
      res,
      503,
      "ONELINK_SERVICE_UNAVAILABLE",
      "One Link is temporarily unavailable.",
    );
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getRequestUrl(req) {
  return new URL(
    req.originalUrl || req.url,
    `http://${req.headers?.host || "localhost"}`,
  );
}

function getAction(req) {
  const url = getRequestUrl(req);
  return String(
    req.query?.action || url.searchParams.get("action") || "",
  )
    .trim()
    .toLowerCase();
}

function getUsername(req) {
  const url = getRequestUrl(req);
  return normalizeOneLinkUsername(
    req.query?.username || url.searchParams.get("username"),
  );
}

function getJsonBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body || {};
}

const hasJsonContentType = (req) => {
  const contentType = String(
    req.headers?.["content-type"] || "",
  ).trim();
  return /^application\/json(?:\s*;\s*charset\s*=\s*[^;]+)?\s*$/i.test(
    contentType,
  );
};

async function findProfileByUsername(supabase, username) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .ilike("username", escapeLikePattern(username))
    .maybeSingle();

  if (error) return { profile: null, failed: true };
  return { profile: data || null, failed: false };
}

async function findOwnerProfile(supabase, ownerUserId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("clerk_id", ownerUserId)
    .maybeSingle();

  if (error) return { profile: null, failed: true };
  return { profile: data || null, failed: false };
}

function toOwnerResponse(profile) {
  const parsed = parseOneLinkProfileBio(profile.bio);
  return {
    username: normalizeOneLinkUsername(profile.username),
    displayName: String(profile.full_name || "").trim(),
    biography: parsed.biography,
    imageUrl:
      normalizeExternalUrl(
        profile.profile_pic_url || profile.image_url,
      ) || null,
    settings: parsed.settings,
  };
}

function toPublicResponse(profile) {
  const owner = toOwnerResponse(profile);
  const settings = normalizeOneLinkSettings(owner.settings);
  return {
    username: owner.username,
    displayName:
      owner.displayName.slice(0, ONE_LINK_LIMITS.displayName) ||
      owner.username,
    biography: owner.biography.slice(
      0,
      ONE_LINK_LIMITS.biography,
    ),
    imageUrl: owner.imageUrl,
    settings: {
      theme: settings.theme,
      socials: settings.socials.filter(
        (entry) =>
          entry.enabled &&
          !entry.invalid &&
          Boolean(normalizeExternalUrl(entry.url)),
      ),
      projects: settings.projects.filter(
        (entry) =>
          entry.enabled &&
          !entry.invalid &&
          Boolean(normalizeExternalUrl(entry.url)),
      ),
      seoTitle: settings.seoTitle,
      seoDescription: settings.seoDescription,
      messageEnabled: settings.messageEnabled,
    },
  };
}

async function handlePublic(req, res) {
  if (req.method !== "GET") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
    );
  }

  const username = getUsername(req);
  if (!username) {
    return sendError(
      res,
      400,
      "ONELINK_USERNAME_INVALID",
      "The One Link username is invalid.",
    );
  }

  const supabase = getServiceClient(res);
  if (!supabase) return;
  const result = await findProfileByUsername(supabase, username);

  if (result.failed) {
    return sendError(
      res,
      503,
      "ONELINK_LOOKUP_FAILED",
      "This One Link could not be loaded.",
    );
  }
  if (!result.profile) {
    return sendError(
      res,
      404,
      "ONELINK_NOT_FOUND",
      "This One Link does not exist.",
    );
  }

  const owner = toOwnerResponse(result.profile);
  if (!owner.username) {
    return sendError(
      res,
      404,
      "ONELINK_NOT_FOUND",
      "This One Link does not exist.",
    );
  }
  if (!owner.settings.published) {
    return sendError(
      res,
      403,
      "ONELINK_UNPUBLISHED",
      "This One Link is not published.",
    );
  }

  return res.status(200).json({
    success: true,
    profile: toPublicResponse(result.profile),
  });
}

async function handleOwner(req, res) {
  if (req.method !== "GET") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
    );
  }

  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const supabase = getServiceClient(res);
  if (!supabase) return;
  const result = await findOwnerProfile(supabase, actor.userId);

  if (result.failed) {
    return sendError(
      res,
      503,
      "ONELINK_OWNER_LOOKUP_FAILED",
      "Your One Link could not be loaded.",
    );
  }
  if (!result.profile) {
    return sendError(
      res,
      404,
      "ONELINK_OWNER_NOT_FOUND",
      "Your Plugsy profile could not be found.",
    );
  }

  return res.status(200).json({
    success: true,
    profile: toOwnerResponse(result.profile),
  });
}

async function handleSave(req, res) {
  if (req.method !== "POST") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
    );
  }

  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const supabase = getServiceClient(res);
  if (!supabase) return;

  let payload;
  try {
    payload = validateOneLinkSavePayload(getJsonBody(req));
  } catch (error) {
    if (error instanceof OneLinkValidationError) {
      return sendError(res, 400, error.code, error.message);
    }
    return sendError(
      res,
      400,
      "ONELINK_PAYLOAD_INVALID",
      "One Link settings are invalid.",
    );
  }

  const ownerResult = await findOwnerProfile(
    supabase,
    actor.userId,
  );
  if (ownerResult.failed) {
    return sendError(
      res,
      503,
      "ONELINK_OWNER_LOOKUP_FAILED",
      "Your One Link could not be saved.",
    );
  }
  if (!ownerResult.profile) {
    return sendError(
      res,
      404,
      "ONELINK_OWNER_NOT_FOUND",
      "Your Plugsy profile could not be found.",
    );
  }

  const username = normalizeOneLinkUsername(
    ownerResult.profile.username,
  );
  if (!username) {
    return sendError(
      res,
      409,
      "ONELINK_USERNAME_REQUIRED",
      "Claim a Wallet Tag before publishing One Link.",
    );
  }

  const serializedBio = serializeOneLinkProfileBio(
    ownerResult.profile.bio,
    payload.biography,
    payload.settings,
  );
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: payload.displayName,
      bio: serializedBio,
    })
    .eq("clerk_id", actor.userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (updateError || !updated) {
    return sendError(
      res,
      503,
      "ONELINK_SAVE_FAILED",
      "Your One Link could not be saved.",
    );
  }

  return res.status(200).json({
    success: true,
    profile: toOwnerResponse(updated),
  });
}

async function resolvePublishedOwner(supabase, username) {
  const result = await findProfileByUsername(supabase, username);
  if (result.failed || !result.profile) return result;
  const owner = toOwnerResponse(result.profile);
  if (!owner.username || !owner.settings.published) {
    return { profile: null, failed: false };
  }
  return result;
}

async function handleRecordView(req, res) {
  if (req.method !== "POST") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
    );
  }

  let body;
  try {
    body = getJsonBody(req);
  } catch {
    return sendError(
      res,
      400,
      "ONELINK_PAYLOAD_INVALID",
      "The request is invalid.",
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "username")
  ) {
    return sendError(
      res,
      400,
      "ONELINK_PAYLOAD_INVALID",
      "The request is invalid.",
    );
  }
  const username = normalizeOneLinkUsername(body?.username);
  if (!username) {
    return sendError(
      res,
      400,
      "ONELINK_USERNAME_INVALID",
      "The One Link username is invalid.",
    );
  }

  const supabase = getServiceClient(res);
  if (!supabase) return;
  const result = await resolvePublishedOwner(supabase, username);
  if (result.failed) {
    return sendError(
      res,
      503,
      "ONELINK_LOOKUP_FAILED",
      "The page view could not be recorded.",
    );
  }
  if (!result.profile) {
    return sendError(
      res,
      404,
      "ONELINK_NOT_FOUND",
      "This One Link does not exist.",
    );
  }

  const utcDate = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.rpc(
    "increment_one_link_page_view_daily_v1",
    {
      p_owner_user_id: result.profile.clerk_id,
      p_view_date: utcDate,
    },
  );
  if (error) {
    return sendError(
      res,
      503,
      "ONELINK_VIEW_UNAVAILABLE",
      "The page view could not be recorded.",
    );
  }

  return res.status(200).json({ success: true });
}

const utcDateKey = (date) => date.toISOString().slice(0, 10);

async function handleAnalytics(req, res) {
  if (req.method !== "GET") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
    );
  }

  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const supabase = getServiceClient(res);
  if (!supabase) return;
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("one_link_page_views_daily_v1")
      .select("view_date,view_count")
      .eq("owner_user_id", actor.userId)
      .order("view_date", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return sendError(
        res,
        503,
        "ONELINK_ANALYTICS_UNAVAILABLE",
        "One Link analytics are temporarily unavailable.",
      );
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const counts = new Map();
  let totalViews = 0;
  for (const row of rows) {
    const count = Math.max(0, Number(row.view_count) || 0);
    counts.set(String(row.view_date), count);
    totalViews += count;
  }

  const now = new Date();
  const todayKey = utcDateKey(now);
  const daily = [];
  let sevenDayViews = 0;
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - offset,
      ),
    );
    const dateKey = utcDateKey(date);
    const views = counts.get(dateKey) || 0;
    if (offset <= 6) sevenDayViews += views;
    daily.push({ date: dateKey, views });
  }

  return res.status(200).json({
    success: true,
    analytics: {
      totalViews,
      todayViews: counts.get(todayKey) || 0,
      sevenDayViews,
      daily,
    },
  });
}

export default async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const action = getAction(req);
  if (
    req.method === "POST" &&
    (action === "save" || action === "view") &&
    !hasJsonContentType(req)
  ) {
    return sendError(
      res,
      415,
      "ONELINK_CONTENT_TYPE_REQUIRED",
      "Use application/json for this request.",
    );
  }
  if (action === "public") return handlePublic(req, res);
  if (action === "owner") return handleOwner(req, res);
  if (action === "save") return handleSave(req, res);
  if (action === "view") return handleRecordView(req, res);
  if (action === "analytics") return handleAnalytics(req, res);

  return sendError(
    res,
    404,
    "ONELINK_ACTION_NOT_FOUND",
    "Unknown One Link action.",
  );
}
