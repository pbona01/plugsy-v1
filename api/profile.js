import { createClient } from "@supabase/supabase-js";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";
import {
  normalizeExternalUrl,
  normalizeOneLinkSettings,
  normalizeOneLinkUsername,
  parseOneLinkProfileBio,
} from "../shared/onelink.js";

const CHAT_USERNAME_PATTERN = /^[a-z0-9_]{1,64}$/;
const DISPLAY_CONTROL_PATTERN = /[\u0000-\u001F\u007F]/;
const BIO_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const PROFILE_COLUMNS = [
  "id",
  "clerk_id",
  "email",
  "full_name",
  "username",
  "bio",
  "profile_pic_url",
  "image_url",
  "one_link_username",
  "one_link_display_name",
  "one_link_biography",
  "one_link_avatar_url",
  "one_link_avatar_public_id",
  "one_link_wallpaper_url",
  "one_link_wallpaper_public_id",
  "one_link_wallpaper_text_mode",
  "one_link_settings",
  "one_link_updated_at",
  "updated_at",
].join(",");

const sendError = (res, status, code, error) =>
  res.status(status).json({ success: false, code, error });

function getServiceClient(res) {
  const url = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  ).trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    sendError(
      res,
      503,
      "PROFILE_SERVICE_UNAVAILABLE",
      "Profile settings are temporarily unavailable.",
    );
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const getAction = (req) => {
  const url = new URL(
    req.originalUrl || req.url,
    `http://${req.headers?.host || "localhost"}`,
  );
  return String(req.query?.action || url.searchParams.get("action") || "")
    .trim()
    .toLowerCase();
};

const parseBody = (req) => {
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body || {};
};

const escapeLikePattern = (value) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

function validateChatPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("PROFILE_PAYLOAD_INVALID");
  }
  const allowed = new Set([
    "displayName",
    "username",
    "biography",
    "profileImageUrl",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new Error("PROFILE_PAYLOAD_INVALID");
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const username =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const biography =
    typeof body.biography === "string" ? body.biography.trim() : "";
  const hasProfileImage = Object.prototype.hasOwnProperty.call(
    body,
    "profileImageUrl",
  );
  const profileImageUrl =
    body.profileImageUrl === null || body.profileImageUrl === ""
      ? null
      : typeof body.profileImageUrl === "string"
        ? body.profileImageUrl.trim()
        : undefined;

  if (
    !displayName ||
    displayName.length > 80 ||
    DISPLAY_CONTROL_PATTERN.test(displayName)
  ) {
    throw new Error("PROFILE_DISPLAY_NAME_INVALID");
  }
  if (!CHAT_USERNAME_PATTERN.test(username)) {
    throw new Error("PROFILE_USERNAME_INVALID");
  }
  if (biography.length > 500 || BIO_CONTROL_PATTERN.test(biography)) {
    throw new Error("PROFILE_BIOGRAPHY_INVALID");
  }
  if (hasProfileImage) {
    let parsedImageUrl = null;
    try {
      parsedImageUrl = profileImageUrl ? new URL(profileImageUrl) : null;
    } catch {
      parsedImageUrl = null;
    }
    if (
      profileImageUrl !== null &&
      (!parsedImageUrl ||
        parsedImageUrl.protocol !== "https:" ||
        profileImageUrl.length > 2048 ||
        DISPLAY_CONTROL_PATTERN.test(profileImageUrl))
    ) {
      throw new Error("PROFILE_IMAGE_INVALID");
    }
  }
  return {
    displayName,
    username,
    biography,
    hasProfileImage,
    profileImageUrl,
  };
}

const safeMessage = (code) => {
  if (code === "PROFILE_DISPLAY_NAME_INVALID") {
    return "Display name is required and must be 80 characters or fewer.";
  }
  if (code === "PROFILE_USERNAME_INVALID") {
    return "Chat username must contain 1–64 lowercase letters, numbers, or underscores.";
  }
  if (code === "PROFILE_BIOGRAPHY_INVALID") {
    return "Chat biography must be 500 characters or fewer.";
  }
  if (code === "PROFILE_IMAGE_INVALID") {
    return "Choose a valid secure Chat profile image.";
  }
  return "Chat profile details are invalid.";
};

const normalizedChatProfile = (profile) => ({
  clerk_id: String(profile.clerk_id || "").trim(),
  full_name: String(profile.full_name || "").trim(),
  username: String(profile.username || "").trim().toLowerCase(),
  bio: typeof profile.bio === "string" ? profile.bio : "",
  profile_pic_url: profile.profile_pic_url || null,
  image_url: profile.image_url || null,
});

async function saveChatProfile(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const supabase = getServiceClient(res);
  if (!supabase) return;

  let payload;
  try {
    payload = validateChatPayload(parseBody(req));
  } catch (error) {
    const code = String(error?.message || "PROFILE_PAYLOAD_INVALID");
    return sendError(res, 400, code, safeMessage(code));
  }

  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("clerk_id", actor.userId)
    .maybeSingle();
  if (lookupError || !existing) {
    return sendError(
      res,
      lookupError ? 503 : 404,
      lookupError ? "PROFILE_LOOKUP_FAILED" : "PROFILE_NOT_FOUND",
      "Your Chat profile could not be loaded.",
    );
  }

  const { data: usernameRows, error: usernameError } = await supabase
    .from("profiles")
    .select("clerk_id,username")
    .ilike("username", escapeLikePattern(payload.username))
    .limit(2);
  if (usernameError) {
    return sendError(
      res,
      503,
      "PROFILE_USERNAME_LOOKUP_FAILED",
      "Chat username availability could not be checked.",
    );
  }
  const conflictingUsername = (usernameRows || []).some(
    (profile) =>
      String(profile.username || "").trim().toLowerCase() === payload.username &&
      profile.clerk_id !== actor.userId,
  );
  if (conflictingUsername) {
    return sendError(
      res,
      409,
      "PROFILE_USERNAME_TAKEN",
      "That Chat username is already taken.",
    );
  }

  const legacy = parseOneLinkProfileBio(existing.bio);
  const legacyAvatar = normalizeExternalUrl(
    existing.profile_pic_url || existing.image_url,
  );
  const now = new Date().toISOString();
  const update = {
    full_name: payload.displayName,
    username: payload.username,
    bio: payload.biography,
    updated_at: now,
  };
  if (payload.hasProfileImage) {
    update.profile_pic_url = payload.profileImageUrl;
  }

  if (existing.one_link_updated_at === null) {
    if (existing.one_link_username === null) {
      update.one_link_username = normalizeOneLinkUsername(existing.username) || null;
    }
    if (existing.one_link_display_name === null) {
      update.one_link_display_name = String(existing.full_name || "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .trim()
        .slice(0, 80);
    }
    if (existing.one_link_biography === null) {
      update.one_link_biography = legacy.biography.slice(0, 500);
    }
    if (
      existing.one_link_avatar_url === null &&
      legacyAvatar?.startsWith("https://")
    ) {
      update.one_link_avatar_url = legacyAvatar;
    }
    if (existing.one_link_settings === null) {
      update.one_link_settings = normalizeOneLinkSettings(legacy.settings);
    }
    update.one_link_updated_at = existing.updated_at || now;
  }

  const { data: saved, error: saveError } = await supabase
    .from("profiles")
    .update(update)
    .eq("clerk_id", actor.userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (saveError?.code === "23505") {
    return sendError(
      res,
      409,
      "PROFILE_USERNAME_TAKEN",
      "That Chat username is already taken.",
    );
  }
  if (saveError || !saved || saved.clerk_id !== actor.userId) {
    return sendError(
      res,
      503,
      "PROFILE_SAVE_FAILED",
      "Your Chat profile could not be saved.",
    );
  }

  return res.status(200).json({
    success: true,
    profile: normalizedChatProfile(saved),
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();

  const contentType = String(req.headers?.["content-type"] || "").trim();
  if (
    req.method === "POST" &&
    !/^application\/json(?:\s*;\s*charset\s*=\s*[^;]+)?\s*$/i.test(
      contentType,
    )
  ) {
    return sendError(
      res,
      415,
      "PROFILE_CONTENT_TYPE_REQUIRED",
      "Use application/json for this request.",
    );
  }

  const action = getAction(req);
  if (action === "save-chat-profile") return saveChatProfile(req, res);
  return sendError(
    res,
    404,
    "PROFILE_ACTION_NOT_FOUND",
    "Unknown profile action.",
  );
}
