import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";
import {
  ONE_LINK_LIMITS,
  normalizeExternalUrl,
  normalizeOneLinkSettings,
  normalizeOneLinkTextMode,
  normalizeOneLinkUsername,
  OneLinkValidationError,
  parseOneLinkProfileBio,
  normalizeOneLinkOwnerProfile,
  validateOneLinkSavePayload,
  validateOneLinkUnpublishPayload,
} from "../shared/onelink.js";

const PROFILE_COLUMNS =
  "clerk_id,username,full_name,profile_pic_url,image_url,bio,one_link_username,one_link_display_name,one_link_biography,one_link_avatar_url,one_link_avatar_public_id,one_link_wallpaper_url,one_link_wallpaper_public_id,one_link_wallpaper_text_mode,one_link_settings,one_link_updated_at";
const escapeLikePattern = (value) =>
  value.replace(/[\\%_]/g, "\\$&");
const CLOUDINARY_PUBLIC_ID_PATTERN =
  /^plugsy\/onelink\/[a-f0-9]{40}\/(avatar|wallpaper)\/[a-f0-9-]{36}$/;

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
  const { data: explicit, error: explicitError } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("one_link_username", username)
    .maybeSingle();

  if (explicitError) return { profile: null, failed: true };
  if (explicit) return { profile: explicit, failed: false };

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .is("one_link_username", null)
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

export function toOwnerResponse(profile) {
  return normalizeOneLinkOwnerProfile(profile);
}

const revisionConflict = (res) =>
  sendError(
    res,
    409,
    "ONELINK_REVISION_CONFLICT",
    "Your One Link changed in another tab. Refresh before saving again.",
  );

export const revisionMatches = (expected, persisted) =>
  expected === (persisted ?? null);

const nextRevision = (currentRevision) => {
  const now = Date.now();
  const currentTime = currentRevision
    ? Date.parse(currentRevision)
    : Number.NaN;
  return new Date(
    Number.isFinite(currentTime) && now <= currentTime
      ? currentTime + 1
      : now,
  ).toISOString();
};

export const withRevisionMatch = (query, revision) =>
  revision === null
    ? query.is("one_link_updated_at", null)
    : query.eq("one_link_updated_at", revision);

export const readPersistedRevision = (profile) => {
  const revision = profile?.one_link_updated_at;
  return typeof revision === "string" && revision.trim()
    ? revision
    : null;
};

export function classifyOneLinkUpdateResult(data, error) {
  if (error) return { kind: "database_error", revision: null };
  if (!data) return { kind: "zero_rows", revision: null };
  const revision = readPersistedRevision(data);
  if (!revision) {
    return { kind: "persisted_revision_invalid", revision: null };
  }
  return { kind: "success", revision };
}

async function publicationConfirmation(
  supabase,
  profile,
  lookupPublicOwner = findProfileByUsername,
) {
  const owner = toOwnerResponse(profile);
  if (!owner.settings.published || !owner.username) return false;
  const resolved = await lookupPublicOwner(supabase, owner.username);
  if (
    resolved.failed ||
    !resolved.profile ||
    resolved.profile.clerk_id !== profile.clerk_id
  ) {
    return false;
  }
  const publicOwner = toOwnerResponse(resolved.profile);
  if (!publicOwner.settings.published || !publicOwner.username) return false;
  return Boolean(toPublicResponse(resolved.profile));
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
    wallpaperUrl: owner.wallpaperUrl,
    wallpaperTextMode: owner.wallpaperTextMode,
    messageUsername: settings.messageEnabled
      ? owner.messageUsername
      : null,
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

function getCloudinaryConfig() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  const uploadPreset = String(
    process.env.CLOUDINARY_ONELINK_UPLOAD_PRESET || "",
  ).trim();
  if (!cloudName || !apiKey || !apiSecret || !uploadPreset) return null;
  return { cloudName, apiKey, apiSecret, uploadPreset };
}

const ownerFolderToken = (ownerUserId, cloudName) =>
  createHash("sha256")
    .update(`${cloudName}:${ownerUserId}`)
    .digest("hex")
    .slice(0, 40);

const ownerAssetPrefix = (ownerUserId, cloudName, kind) =>
  `plugsy/onelink/${ownerFolderToken(ownerUserId, cloudName)}/${kind}/`;

const signCloudinaryParameters = (parameters, apiSecret) => {
  const serialized = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha256")
    .update(`${serialized}${apiSecret}`)
    .digest("hex");
};

const cloudinaryUrlMatches = (urlValue, publicId, cloudName) => {
  try {
    const parsed = new URL(urlValue);
    const decodedPath = decodeURIComponent(parsed.pathname);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      decodedPath.startsWith(`/${cloudName}/image/upload/`) &&
      new RegExp(`/${publicId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[A-Za-z0-9]+$`).test(
        decodedPath,
      )
    );
  } catch {
    return false;
  }
};

const validateOwnedMedia = ({
  ownerUserId,
  kind,
  url,
  publicId,
  cloudinary,
}) => {
  if (!url && !publicId) return true;
  if (!url || !publicId || !cloudinary) return false;
  if (
    !CLOUDINARY_PUBLIC_ID_PATTERN.test(publicId) ||
    !publicId.startsWith(
      ownerAssetPrefix(ownerUserId, cloudinary.cloudName, kind),
    )
  ) {
    return false;
  }
  return cloudinaryUrlMatches(url, publicId, cloudinary.cloudName);
};

async function destroyCloudinaryAsset(cloudinary, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = { invalidate: "true", public_id: publicId, timestamp };
  const body = new URLSearchParams({
    ...parameters,
    api_key: cloudinary.apiKey,
    signature: signCloudinaryParameters(parameters, cloudinary.apiSecret),
  });
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(
      cloudinary.cloudName,
    )}/image/destroy`,
    { method: "POST", body, signal: AbortSignal.timeout(8000) },
  );
  const result = await response.json().catch(() => null);
  return (
    response.ok &&
    (result?.result === "ok" || result?.result === "not found")
  );
}

export async function handlePublic(req, res, dependencies = {}) {
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

  const supabase = dependencies.supabase || getServiceClient(res);
  if (!supabase) return;
  const lookupPublicOwner =
    dependencies.findProfileByUsername || findProfileByUsername;
  const result = await lookupPublicOwner(supabase, username);

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

  const published = toOwnerResponse(result.profile).settings.published;
  const liveConfirmed = published
    ? await publicationConfirmation(supabase, result.profile)
    : false;
  return res.status(200).json({
    success: true,
    profile: toOwnerResponse(result.profile),
    revision: result.profile.one_link_updated_at ?? null,
    published,
    liveConfirmed,
  });
}

export async function confirmFailClosedPublicationRollback({
  supabase,
  ownerUserId,
  username,
  settings,
  publishRevision,
  createRevision = nextRevision,
  loadOwner = findOwnerProfile,
  logger = console,
}) {
  const reportUnconfirmed = (rollbackErrorCategory) => {
    logger.error("[onelink] CRITICAL publish fail-closed unconfirmed", {
      code: "ONELINK_PUBLISH_FAIL_CLOSED_UNCONFIRMED",
      ownerIdHash: createHash("sha256")
        .update(String(ownerUserId || ""))
        .digest("hex")
        .slice(0, 12),
      username,
      attemptedRevision: publishRevision,
      rollbackErrorCategory,
    });
    return {
      confirmed: false,
      revision: null,
      rollbackErrorCategory,
    };
  };

  let rollbackResult;
  try {
    const attemptedRollbackRevision = createRevision(publishRevision);
    let rollbackQuery = supabase
      .from("profiles")
      .update({
        one_link_settings: {
          ...settings,
          published: false,
        },
        one_link_updated_at: attemptedRollbackRevision,
      })
      .eq("clerk_id", ownerUserId);
    rollbackQuery = withRevisionMatch(
      rollbackQuery,
      publishRevision,
    );
    const { data: rolledBack, error: rollbackError } =
      await rollbackQuery.select(PROFILE_COLUMNS).maybeSingle();
    rollbackResult = classifyOneLinkUpdateResult(
      rolledBack,
      rollbackError,
    );
  } catch {
    return reportUnconfirmed("rollback_query_threw");
  }
  if (rollbackResult.kind !== "success") {
    return reportUnconfirmed(rollbackResult.kind);
  }

  const rollbackRevision = rollbackResult.revision;
  let reread;
  try {
    reread = await loadOwner(supabase, ownerUserId);
  } catch {
    return reportUnconfirmed("owner_reread_threw");
  }
  if (reread.failed) {
    return reportUnconfirmed("owner_reread_failed");
  }
  if (!reread.profile) {
    return reportUnconfirmed("owner_reread_missing");
  }
  if (reread.profile.clerk_id !== ownerUserId) {
    return reportUnconfirmed("owner_identity_mismatch");
  }
  if (reread.profile.one_link_settings?.published !== false) {
    return reportUnconfirmed("owner_still_published");
  }
  if (readPersistedRevision(reread.profile) !== rollbackRevision) {
    return reportUnconfirmed("rollback_revision_mismatch");
  }
  return {
    confirmed: true,
    revision: rollbackRevision,
    rollbackErrorCategory: null,
  };
}

export async function handleDraftMutation(
  req,
  res,
  action,
  dependencies = {},
) {
  if (req.method !== "POST") {
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
    );
  }

  const authenticate =
    dependencies.authenticate || requireVerifiedClerkUser;
  const actor = await authenticate(req, res);
  if (!actor) return;
  const supabase = dependencies.supabase || getServiceClient(res);
  if (!supabase) return;
  const lookupPublicOwner =
    dependencies.findProfileByUsername || findProfileByUsername;
  const loadOwner = dependencies.findOwnerProfile || findOwnerProfile;
  const createRevision = dependencies.nextRevision || nextRevision;

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

  const ownerResult = await loadOwner(
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

  const currentRevision =
    ownerResult.profile.one_link_updated_at ?? null;
  if (!revisionMatches(payload.expectedRevision, currentRevision)) {
    return revisionConflict(res);
  }

  const currentOwner = toOwnerResponse(ownerResult.profile);
  const username = currentOwner.username;
  if (action === "publish" && !username) {
    return sendError(
      res,
      409,
      "ONELINK_USERNAME_REQUIRED",
      "Set up your One Link handle before publishing.",
    );
  }

  if (action === "publish") {
    const publicOwner = await lookupPublicOwner(supabase, username);
    if (publicOwner.failed) {
      return sendError(
        res,
        503,
        "ONELINK_PUBLISH_VERIFICATION_FAILED",
        "Your One Link could not be safely published.",
      );
    }
    if (
      !publicOwner.profile ||
      publicOwner.profile.clerk_id !== actor.userId
    ) {
      return sendError(
        res,
        409,
        "ONELINK_PUBLIC_OWNER_MISMATCH",
        "That One Link handle belongs to another profile.",
      );
    }
  }

  const cloudinary = Object.prototype.hasOwnProperty.call(
    dependencies,
    "cloudinary",
  )
    ? dependencies.cloudinary
    : getCloudinaryConfig();
  const unchangedLegacyAvatar =
    Boolean(payload.imageUrl) &&
    !payload.imagePublicId &&
    !ownerResult.profile.one_link_avatar_public_id &&
    payload.imageUrl === currentOwner.imageUrl;
  const avatarIsOwned = validateOwnedMedia({
    ownerUserId: actor.userId,
    kind: "avatar",
    url: payload.imageUrl,
    publicId: payload.imagePublicId,
    cloudinary,
  });
  const wallpaperIsOwned = validateOwnedMedia({
    ownerUserId: actor.userId,
    kind: "wallpaper",
    url: payload.wallpaperUrl,
    publicId: payload.wallpaperPublicId,
    cloudinary,
  });
  if ((!avatarIsOwned && !unchangedLegacyAvatar) || !wallpaperIsOwned) {
    return sendError(
      res,
      400,
      "ONELINK_MEDIA_OWNERSHIP_INVALID",
      "One Link media could not be verified for this account.",
    );
  }

  const oldAssets = [
    {
      kind: "avatar",
      publicId: ownerResult.profile.one_link_avatar_public_id,
      replacement: payload.imagePublicId,
    },
    {
      kind: "wallpaper",
      publicId: ownerResult.profile.one_link_wallpaper_public_id,
      replacement: payload.wallpaperPublicId,
    },
  ];
  const attemptedRevision = createRevision(currentRevision);
  const persistedSettings = {
    ...payload.settings,
    published:
      action === "publish"
        ? true
        : currentOwner.settings.published,
  };
  let updateQuery = supabase
    .from("profiles")
    .update({
      one_link_username:
        ownerResult.profile.one_link_username === null
          ? username || null
          : ownerResult.profile.one_link_username,
      one_link_display_name: payload.displayName,
      one_link_biography: payload.biography,
      one_link_avatar_url: payload.imageUrl,
      one_link_avatar_public_id: payload.imagePublicId,
      one_link_wallpaper_url: payload.wallpaperUrl,
      one_link_wallpaper_public_id: payload.wallpaperPublicId,
      one_link_wallpaper_text_mode: payload.wallpaperTextMode,
      one_link_settings: persistedSettings,
      one_link_updated_at: attemptedRevision,
    })
    .eq("clerk_id", actor.userId);
  updateQuery = withRevisionMatch(updateQuery, currentRevision);
  const { data: updated, error: updateError } = await updateQuery
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  const updateResult = classifyOneLinkUpdateResult(
    updated,
    updateError,
  );
  if (updateResult.kind === "database_error") {
    return sendError(
      res,
      503,
      "ONELINK_SAVE_FAILED",
      "Your One Link could not be saved.",
    );
  }
  if (updateResult.kind === "zero_rows") {
    return revisionConflict(res);
  }
  if (updateResult.kind !== "success") {
    return sendError(
      res,
      503,
      "ONELINK_SAVE_FAILED",
      "Your One Link could not be saved.",
    );
  }
  const persistedRevision = updateResult.revision;

  let liveConfirmed = false;
  if (action === "publish") {
    const verifiedOwner = await loadOwner(supabase, actor.userId);
    const verifiedPublic = await lookupPublicOwner(
      supabase,
      username,
    );
    liveConfirmed = Boolean(
      !verifiedOwner.failed &&
        verifiedOwner.profile &&
        toOwnerResponse(verifiedOwner.profile).settings.published &&
        readPersistedRevision(verifiedOwner.profile) ===
          persistedRevision &&
        !verifiedPublic.failed &&
        verifiedPublic.profile &&
        verifiedPublic.profile.clerk_id === actor.userId &&
        toOwnerResponse(verifiedPublic.profile).settings.published &&
        toPublicResponse(verifiedPublic.profile),
    );

    if (!liveConfirmed) {
      const rollback = await confirmFailClosedPublicationRollback({
        supabase,
        ownerUserId: actor.userId,
        username,
        settings: persistedSettings,
        publishRevision: persistedRevision,
        createRevision,
        loadOwner,
        logger: dependencies.logger || console,
      });
      if (!rollback.confirmed) {
        return sendError(
          res,
          503,
          "ONELINK_PUBLISH_FAIL_CLOSED_UNCONFIRMED",
          "Your One Link publication could not be safely confirmed.",
        );
      }
      return sendError(
        res,
        503,
        "ONELINK_PUBLISH_VERIFICATION_FAILED",
        "Your One Link could not be safely published.",
      );
    }
  } else if (persistedSettings.published) {
    liveConfirmed = await publicationConfirmation(
      supabase,
      updated,
      lookupPublicOwner,
    );
  }

  if (cloudinary) {
    await Promise.all(
      oldAssets.map(async ({ kind, publicId, replacement }) => {
        if (!publicId || publicId === replacement) return;
        try {
          const destroyed = await destroyCloudinaryAsset(
            cloudinary,
            publicId,
          );
          if (!destroyed) {
            console.warn("One Link asset cleanup was not confirmed", {
              kind,
              publicId,
            });
          }
        } catch {
          console.warn("One Link asset cleanup failed", { kind, publicId });
        }
      }),
    );
  }

  return res.status(200).json({
    success: true,
    profile: toOwnerResponse(updated),
    revision: persistedRevision,
    published: persistedSettings.published,
    liveConfirmed,
  });
}

async function handleSave(req, res) {
  return handleDraftMutation(req, res, "save");
}

async function handlePublish(req, res) {
  return handleDraftMutation(req, res, "publish");
}

export async function handleUnpublish(
  req,
  res,
  dependencies = {},
) {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }
  const authenticate =
    dependencies.authenticate || requireVerifiedClerkUser;
  const actor = await authenticate(req, res);
  if (!actor) return;
  const supabase = dependencies.supabase || getServiceClient(res);
  if (!supabase) return;
  const createRevision = dependencies.nextRevision || nextRevision;
  const loadOwner = dependencies.findOwnerProfile || findOwnerProfile;

  let payload;
  try {
    payload = validateOneLinkUnpublishPayload(getJsonBody(req));
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

  const ownerResult = await loadOwner(supabase, actor.userId);
  if (ownerResult.failed) {
    return sendError(
      res,
      503,
      "ONELINK_OWNER_LOOKUP_FAILED",
      "Your One Link could not be unpublished.",
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

  const currentRevision = ownerResult.profile.one_link_updated_at ?? null;
  if (!revisionMatches(payload.expectedRevision, currentRevision)) {
    return revisionConflict(res);
  }
  const attemptedRevision = createRevision(currentRevision);
  const storedSettings =
    ownerResult.profile.one_link_settings &&
    typeof ownerResult.profile.one_link_settings === "object" &&
    !Array.isArray(ownerResult.profile.one_link_settings)
      ? ownerResult.profile.one_link_settings
      : toOwnerResponse(ownerResult.profile).settings;
  const settings = {
    ...storedSettings,
    published: false,
  };
  let updateQuery = supabase
    .from("profiles")
    .update({
      one_link_settings: settings,
      one_link_updated_at: attemptedRevision,
    })
    .eq("clerk_id", actor.userId);
  updateQuery = withRevisionMatch(updateQuery, currentRevision);
  const { data: updated, error: updateError } = await updateQuery
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  const updateResult = classifyOneLinkUpdateResult(
    updated,
    updateError,
  );
  if (updateResult.kind === "database_error") {
    return sendError(
      res,
      503,
      "ONELINK_UNPUBLISH_FAILED",
      "Your One Link could not be unpublished.",
    );
  }
  if (updateResult.kind === "zero_rows") {
    return revisionConflict(res);
  }
  if (updateResult.kind !== "success") {
    return sendError(
      res,
      503,
      "ONELINK_UNPUBLISH_FAILED",
      "Your One Link could not be unpublished.",
    );
  }
  const persistedRevision = updateResult.revision;
  const verifiedOwner = await loadOwner(supabase, actor.userId);
  if (
    verifiedOwner.failed ||
    !verifiedOwner.profile ||
    readPersistedRevision(verifiedOwner.profile) !== persistedRevision ||
    verifiedOwner.profile.one_link_settings?.published !== false
  ) {
    return sendError(
      res,
      503,
      "ONELINK_PUBLISH_VERIFICATION_FAILED",
      "Your One Link could not be safely unpublished.",
    );
  }
  return res.status(200).json({
    success: true,
    profile: toOwnerResponse(verifiedOwner.profile),
    revision: persistedRevision,
    published: false,
    liveConfirmed: false,
  });
}

async function handleUploadSignature(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;

  let body;
  try {
    body = getJsonBody(req);
  } catch {
    body = null;
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "kind") ||
    (body.kind !== "avatar" && body.kind !== "wallpaper")
  ) {
    return sendError(
      res,
      400,
      "ONELINK_UPLOAD_KIND_INVALID",
      "Select a valid One Link image type.",
    );
  }

  const cloudinary = getCloudinaryConfig();
  if (!cloudinary) {
    return sendError(
      res,
      503,
      "ONELINK_UPLOAD_UNAVAILABLE",
      "Secure image upload is temporarily unavailable.",
    );
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${ownerAssetPrefix(
    actor.userId,
    cloudinary.cloudName,
    body.kind,
  )}${randomUUID()}`;
  const parameters = {
    overwrite: "false",
    public_id: publicId,
    timestamp,
    upload_preset: cloudinary.uploadPreset,
  };
  return res.status(200).json({
    success: true,
    cloudName: cloudinary.cloudName,
    apiKey: cloudinary.apiKey,
    uploadPreset: cloudinary.uploadPreset,
    timestamp,
    publicId,
    signature: signCloudinaryParameters(parameters, cloudinary.apiSecret),
  });
}

async function handleDestroyAsset(req, res) {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const supabase = getServiceClient(res);
  if (!supabase) return;
  const cloudinary = getCloudinaryConfig();
  if (!cloudinary) {
    return sendError(
      res,
      503,
      "ONELINK_UPLOAD_UNAVAILABLE",
      "Secure image cleanup is temporarily unavailable.",
    );
  }

  let body;
  try {
    body = getJsonBody(req);
  } catch {
    body = null;
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => key !== "kind" && key !== "publicId",
    ) ||
    (body.kind !== "avatar" && body.kind !== "wallpaper") ||
    typeof body.publicId !== "string" ||
    !body.publicId.startsWith(
      ownerAssetPrefix(actor.userId, cloudinary.cloudName, body.kind),
    ) ||
    !CLOUDINARY_PUBLIC_ID_PATTERN.test(body.publicId)
  ) {
    return sendError(
      res,
      400,
      "ONELINK_MEDIA_OWNERSHIP_INVALID",
      "One Link media could not be verified for this account.",
    );
  }

  const ownerResult = await findOwnerProfile(supabase, actor.userId);
  if (ownerResult.failed || !ownerResult.profile) {
    return sendError(
      res,
      503,
      "ONELINK_OWNER_LOOKUP_FAILED",
      "One Link media could not be checked.",
    );
  }
  const currentPublicId =
    body.kind === "avatar"
      ? ownerResult.profile.one_link_avatar_public_id
      : ownerResult.profile.one_link_wallpaper_public_id;
  if (currentPublicId === body.publicId) {
    return sendError(
      res,
      409,
      "ONELINK_ASSET_STILL_ACTIVE",
      "Save the One Link change before cleaning up this image.",
    );
  }

  try {
    const destroyed = await destroyCloudinaryAsset(cloudinary, body.publicId);
    if (!destroyed) throw new Error("cleanup not confirmed");
  } catch {
    return sendError(
      res,
      503,
      "ONELINK_ASSET_CLEANUP_FAILED",
      "The unused image could not be cleaned up yet.",
    );
  }
  return res.status(200).json({ success: true });
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
    (action === "save" ||
      action === "publish" ||
      action === "unpublish" ||
      action === "view" ||
      action === "upload-signature" ||
      action === "destroy-asset") &&
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
  if (action === "publish") return handlePublish(req, res);
  if (action === "unpublish") return handleUnpublish(req, res);
  if (action === "upload-signature") {
    return handleUploadSignature(req, res);
  }
  if (action === "destroy-asset") return handleDestroyAsset(req, res);
  if (action === "view") return handleRecordView(req, res);
  if (action === "analytics") return handleAnalytics(req, res);

  return sendError(
    res,
    404,
    "ONELINK_ACTION_NOT_FOUND",
    "Unknown One Link action.",
  );
}
