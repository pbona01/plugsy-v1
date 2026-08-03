export const ONE_LINK_SCHEMA_VERSION = 1;

export const ONE_LINK_LIMITS = Object.freeze({
  username: 64,
  displayName: 80,
  biography: 500,
  socialPlatform: 40,
  socialLinks: 12,
  featuredLinks: 25,
  featuredTitle: 80,
  featuredDescription: 280,
  seoTitle: 70,
  seoDescription: 160,
  url: 2048,
  itemId: 80,
  publicId: 255,
});

export const ONE_LINK_THEME_IDS = Object.freeze([
  "dark-twilight",
  "cosmic-slate",
  "neon-sunset",
  "cyberpunk",
  "minimalist-light",
]);

export const DEFAULT_ONE_LINK_SETTINGS = Object.freeze({
  schemaVersion: ONE_LINK_SCHEMA_VERSION,
  theme: "dark-twilight",
  socials: Object.freeze([]),
  projects: Object.freeze([]),
  published: true,
  seoTitle: "",
  seoDescription: "",
  messageEnabled: true,
});

const USERNAME_PATTERN = /^[a-z0-9_]{1,64}$/;
const CLOUDINARY_PUBLIC_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9_./-]{0,254}$/;
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PLATFORM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
const URL_CONTROL_PATTERN = /[\u0000-\u001F\u007F]/;
const URL_CONTROL_GLOBAL_PATTERN = /[\u0000-\u001F\u007F]/g;
const TEXT_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const FORBIDDEN_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const KNOWN_ONE_LINK_KEYS = new Set([
  "schemaVersion",
  "theme",
  "socials",
  "projects",
  "published",
  "seoTitle",
  "seoDescription",
  "messageEnabled",
]);

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value);

const boundedString = (value, maximum, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (TEXT_CONTROL_PATTERN.test(normalized)) return fallback;
  return normalized.slice(0, maximum);
};

const stableHash = (value) => {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeItemId = (value, prefix, index, seed) => {
  const candidate = String(value || "").trim();
  if (ITEM_ID_PATTERN.test(candidate)) return candidate;
  return `${prefix}-${index + 1}-${stableHash(seed)}`.slice(
    0,
    ONE_LINK_LIMITS.itemId,
  );
};

function cloneCompatibleJson(value, depth = 0) {
  if (depth > 12) return undefined;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((entry) => cloneCompatibleJson(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (!isPlainObject(value)) return undefined;

  const copy = {};
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) continue;
    const cloned = cloneCompatibleJson(entry, depth + 1);
    if (cloned !== undefined) copy[key] = cloned;
  }
  return copy;
}

export function normalizeOneLinkUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : "";
}

export function normalizeOneLinkTextMode(value) {
  return value === "dark" ? "dark" : "light";
}

export function chooseOneLinkWallpaperTextMode(luminance) {
  return typeof luminance === "number" &&
    Number.isFinite(luminance) &&
    luminance >= 0.42
    ? "dark"
    : "light";
}

export function normalizeExternalUrl(value) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (
    !candidate ||
    candidate.length > ONE_LINK_LIMITS.url ||
    URL_CONTROL_PATTERN.test(candidate)
  ) {
    return null;
  }

  try {
    const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate);
    const parsed = new URL(
      hasProtocol ? candidate : `https://${candidate}`,
    );
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

const sanitizeLegacyUrl = (value) =>
  typeof value === "string"
    ? value
        .replace(URL_CONTROL_GLOBAL_PATTERN, "")
        .trim()
        .slice(0, ONE_LINK_LIMITS.url)
    : "";

export function parseOneLinkProfileBio(rawBio) {
  const raw = typeof rawBio === "string" ? rawBio : "";
  let topLevel = {};
  let biography = raw;
  let rawSettings = {};
  let hasLegacyOneLinkConfiguration = false;

  if (raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        topLevel = cloneCompatibleJson(parsed) || {};
        biography =
          typeof parsed.bio === "string" ? parsed.bio : "";
        hasLegacyOneLinkConfiguration =
          Object.prototype.hasOwnProperty.call(parsed, "onelink") &&
          isPlainObject(parsed.onelink);
        rawSettings = hasLegacyOneLinkConfiguration
          ? parsed.onelink
          : {};
      }
    } catch {
      biography = raw;
    }
  }

  return {
    biography:
      typeof biography === "string" &&
      !TEXT_CONTROL_PATTERN.test(biography)
        ? biography.trim()
        : "",
    settings: normalizeOneLinkSettings(rawSettings, {
      publicationContext: hasLegacyOneLinkConfiguration
        ? "legacy"
        : "fresh",
    }),
    topLevel,
    rawSettings,
    hasLegacyOneLinkConfiguration,
  };
}

export function isVerifiedOneLinkPublicResponse(
  payload,
  responseOk,
  expectedUsername,
) {
  const expected = normalizeOneLinkUsername(expectedUsername);
  if (!responseOk || !expected || payload?.success !== true) return false;
  const profile = payload?.profile;
  if (!isPlainObject(profile)) return false;
  return normalizeOneLinkUsername(profile.username) === expected;
}

export function normalizeOneLinkSettings(
  value,
  { publicationContext = "fresh" } = {},
) {
  const source = isPlainObject(value) ? value : {};
  const theme = ONE_LINK_THEME_IDS.includes(source.theme)
    ? source.theme
    : DEFAULT_ONE_LINK_SETTINGS.theme;

  const socials = (Array.isArray(source.socials)
    ? source.socials
    : [])
    .slice(0, ONE_LINK_LIMITS.socialLinks)
    .map((entry, index) => {
      if (!isPlainObject(entry)) {
        return {
          id: normalizeItemId(entry, "social", index, `social:${index}`),
          platform: "website",
          url: "",
          enabled: false,
          invalid: true,
        };
      }
      const platform = boundedString(
        entry.platform,
        ONE_LINK_LIMITS.socialPlatform,
        "website",
      );
      const url = normalizeExternalUrl(entry.url);
      const invalid = !url;
      return {
        id: normalizeItemId(
          entry.id,
          "social",
          index,
          `${platform}:${url || sanitizeLegacyUrl(entry.url)}:${index}`,
        ),
        platform:
          platform && PLATFORM_PATTERN.test(platform)
            ? platform.toLowerCase()
            : "website",
        url: url || sanitizeLegacyUrl(entry.url),
        enabled: invalid
          ? false
          : typeof entry.enabled === "boolean"
            ? entry.enabled
            : true,
        invalid,
      };
    })
    .filter(Boolean);

  const projects = (Array.isArray(source.projects)
    ? source.projects
    : [])
    .slice(0, ONE_LINK_LIMITS.featuredLinks)
    .map((entry, index) => {
      if (!isPlainObject(entry)) {
        return {
          id: normalizeItemId(entry, "link", index, `link:${index}`),
          title: "Featured link",
          description: "",
          url: "",
          enabled: false,
          invalid: true,
        };
      }
      const rawTitle = boundedString(
        entry.title,
        ONE_LINK_LIMITS.featuredTitle,
      );
      const title = rawTitle || "Featured link";
      const url = normalizeExternalUrl(entry.url);
      const invalid = !rawTitle || !url;
      const description = boundedString(
        entry.description,
        ONE_LINK_LIMITS.featuredDescription,
      );
      return {
        id: normalizeItemId(
          entry.id,
          "link",
          index,
          `${title}:${url || sanitizeLegacyUrl(entry.url)}:${index}`,
        ),
        title,
        description,
        url: url || sanitizeLegacyUrl(entry.url),
        enabled: invalid
          ? false
          : typeof entry.enabled === "boolean"
            ? entry.enabled
            : true,
        invalid,
      };
    })
    .filter(Boolean);

  return {
    schemaVersion: ONE_LINK_SCHEMA_VERSION,
    theme,
    socials,
    projects,
    published:
      typeof source.published === "boolean"
        ? source.published
        : publicationContext === "legacy",
    seoTitle: boundedString(
      source.seoTitle,
      ONE_LINK_LIMITS.seoTitle,
    ),
    seoDescription: boundedString(
      source.seoDescription,
      ONE_LINK_LIMITS.seoDescription,
    ),
    messageEnabled:
      typeof source.messageEnabled === "boolean"
        ? source.messageEnabled
        : true,
  };
}

export function normalizeOneLinkOwnerProfile(profile) {
  const parsed = parseOneLinkProfileBio(profile?.bio);
  const initialized = profile?.one_link_updated_at !== null && profile?.one_link_updated_at !== undefined;
  const present = (value) => value !== null && value !== undefined;
  const independentUsername = initialized && present(profile?.one_link_username);
  const independentDisplayName = initialized && present(profile?.one_link_display_name);
  const independentBiography = initialized && present(profile?.one_link_biography);
  const independentAvatar = initialized && present(profile?.one_link_avatar_url);
  const independentSettings = initialized && present(profile?.one_link_settings);
  return {
    username: normalizeOneLinkUsername(independentUsername ? profile.one_link_username : profile?.username),
    displayName: String(independentDisplayName ? profile.one_link_display_name : profile?.full_name || "").trim(),
    biography: String(independentBiography ? profile.one_link_biography || "" : parsed.biography),
    imageUrl: normalizeExternalUrl(independentAvatar ? profile.one_link_avatar_url : profile?.profile_pic_url || profile?.image_url) || null,
    imagePublicId: profile?.one_link_avatar_public_id || null,
    wallpaperUrl: normalizeExternalUrl(profile?.one_link_wallpaper_url) || null,
    wallpaperPublicId: profile?.one_link_wallpaper_public_id || null,
    wallpaperTextMode: normalizeOneLinkTextMode(profile?.one_link_wallpaper_text_mode),
    messageUsername: normalizeOneLinkUsername(profile?.username) || null,
    settings: independentSettings
      ? normalizeOneLinkSettings(profile.one_link_settings, { publicationContext: "independent" })
      : parsed.settings,
    publicationSource: independentSettings ? "independent" : "legacy",
  };
}

export class OneLinkValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OneLinkValidationError";
    this.code = code;
  }
}

const assertObjectKeys = (value, allowed, code) => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new OneLinkValidationError(
        code,
        "One Link contains an unsupported field.",
      );
    }
  }
};

const validateText = (
  value,
  fieldName,
  maximum,
  { required = false } = {},
) => {
  if (typeof value !== "string") {
    throw new OneLinkValidationError(
      "ONELINK_TEXT_INVALID",
      `${fieldName} must be text.`,
    );
  }
  const normalized = value.trim();
  if (
    TEXT_CONTROL_PATTERN.test(normalized) ||
    normalized.length > maximum ||
    (required && !normalized)
  ) {
    throw new OneLinkValidationError(
      "ONELINK_TEXT_INVALID",
      `${fieldName} is invalid or too long.`,
    );
  }
  return normalized;
};

const validateId = (value, fieldName) => {
  if (
    typeof value !== "string" ||
    !ITEM_ID_PATTERN.test(value.trim())
  ) {
    throw new OneLinkValidationError(
      "ONELINK_ITEM_ID_INVALID",
      `${fieldName} has an invalid item ID.`,
    );
  }
  return value.trim();
};

export function validateOneLinkSavePayload(payload) {
  if (!isPlainObject(payload)) {
    throw new OneLinkValidationError(
      "ONELINK_PAYLOAD_INVALID",
      "One Link settings are invalid.",
    );
  }
  assertObjectKeys(
    payload,
    new Set([
      "displayName",
      "biography",
      "imageUrl",
      "imagePublicId",
      "wallpaperUrl",
      "wallpaperPublicId",
      "wallpaperTextMode",
      "settings",
      "expectedRevision",
    ]),
    "ONELINK_PAYLOAD_FIELDS_INVALID",
  );

  const displayName = validateText(
    payload.displayName,
    "Display name",
    ONE_LINK_LIMITS.displayName,
    { required: true },
  );
  const biography = validateText(
    payload.biography,
    "Biography",
    ONE_LINK_LIMITS.biography,
  );
  const validateOptionalMediaText = (value, fieldName, maximum) => {
    if (value === null || value === undefined || value === "") return null;
    return validateText(value, fieldName, maximum, { required: true });
  };
  const imageUrl = validateOptionalMediaText(
    payload.imageUrl,
    "Profile image URL",
    ONE_LINK_LIMITS.url,
  );
  const imagePublicId = validateOptionalMediaText(
    payload.imagePublicId,
    "Profile image public ID",
    ONE_LINK_LIMITS.publicId,
  );
  const wallpaperUrl = validateOptionalMediaText(
    payload.wallpaperUrl,
    "Wallpaper URL",
    ONE_LINK_LIMITS.url,
  );
  const wallpaperPublicId = validateOptionalMediaText(
    payload.wallpaperPublicId,
    "Wallpaper public ID",
    ONE_LINK_LIMITS.publicId,
  );

  for (const [fieldName, url] of [
    ["Profile image URL", imageUrl],
    ["Wallpaper URL", wallpaperUrl],
  ]) {
    if (!url) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== "https:") {
      throw new OneLinkValidationError(
        "ONELINK_MEDIA_URL_INVALID",
        `${fieldName} must use a secure URL.`,
      );
    }
  }

  for (const publicId of [imagePublicId, wallpaperPublicId]) {
    if (
      publicId &&
      (!CLOUDINARY_PUBLIC_ID_PATTERN.test(publicId) ||
        publicId.includes("..") ||
        publicId.includes("//") ||
        publicId.endsWith("/"))
    ) {
      throw new OneLinkValidationError(
        "ONELINK_MEDIA_PUBLIC_ID_INVALID",
        "One Link media has an invalid public ID.",
      );
    }
  }

  if (imagePublicId && !imageUrl) {
    throw new OneLinkValidationError(
      "ONELINK_MEDIA_PAIR_INVALID",
      "One Link profile image data is incomplete.",
    );
  }
  if (Boolean(wallpaperUrl) !== Boolean(wallpaperPublicId)) {
    throw new OneLinkValidationError(
      "ONELINK_MEDIA_PAIR_INVALID",
      "One Link wallpaper data is incomplete.",
    );
  }
  if (
    payload.wallpaperTextMode !== "light" &&
    payload.wallpaperTextMode !== "dark"
  ) {
    throw new OneLinkValidationError(
      "ONELINK_WALLPAPER_TEXT_MODE_INVALID",
      "Select a valid wallpaper text mode.",
    );
  }
  const source = payload.settings;
  if (!isPlainObject(source)) {
    throw new OneLinkValidationError(
      "ONELINK_SETTINGS_INVALID",
      "One Link settings are invalid.",
    );
  }
  assertObjectKeys(
    source,
    KNOWN_ONE_LINK_KEYS,
    "ONELINK_SETTINGS_FIELDS_INVALID",
  );

  if (!ONE_LINK_THEME_IDS.includes(source.theme)) {
    throw new OneLinkValidationError(
      "ONELINK_THEME_INVALID",
      "Select a valid One Link theme.",
    );
  }
  if (source.schemaVersion !== ONE_LINK_SCHEMA_VERSION) {
    throw new OneLinkValidationError(
      "ONELINK_SCHEMA_VERSION_INVALID",
      "One Link settings use an unsupported schema version.",
    );
  }
  if (
    !Array.isArray(source.socials) ||
    source.socials.length > ONE_LINK_LIMITS.socialLinks
  ) {
    throw new OneLinkValidationError(
      "ONELINK_SOCIAL_LIMIT",
      `Use no more than ${ONE_LINK_LIMITS.socialLinks} social links.`,
    );
  }
  if (
    !Array.isArray(source.projects) ||
    source.projects.length > ONE_LINK_LIMITS.featuredLinks
  ) {
    throw new OneLinkValidationError(
      "ONELINK_FEATURED_LIMIT",
      `Use no more than ${ONE_LINK_LIMITS.featuredLinks} featured links.`,
    );
  }

  const seenIds = new Set();
  const seenUrls = new Set();
  const rememberUrl = (url) => {
    if (!url) return;
    if (seenUrls.has(url)) {
      throw new OneLinkValidationError(
        "ONELINK_URL_DUPLICATE",
        "Each One Link URL must be different.",
      );
    }
    seenUrls.add(url);
  };
  const socials = source.socials.map((entry) => {
    if (!isPlainObject(entry)) {
      throw new OneLinkValidationError(
        "ONELINK_SOCIAL_INVALID",
        "A social link is invalid.",
      );
    }
    assertObjectKeys(
      entry,
      new Set(["id", "platform", "url", "enabled", "invalid"]),
      "ONELINK_SOCIAL_FIELDS_INVALID",
    );
    const id = validateId(entry.id, "Social link");
    if (seenIds.has(id)) {
      throw new OneLinkValidationError(
        "ONELINK_ITEM_ID_DUPLICATE",
        "One Link item IDs must be unique.",
      );
    }
    seenIds.add(id);
    const platform = validateText(
      entry.platform,
      "Social platform",
      ONE_LINK_LIMITS.socialPlatform,
      { required: true },
    );
    if (!PLATFORM_PATTERN.test(platform)) {
      throw new OneLinkValidationError(
        "ONELINK_PLATFORM_INVALID",
        "A social platform name is invalid.",
      );
    }
    const url = normalizeExternalUrl(entry.url);
    if (!url && (entry.enabled || entry.invalid !== true)) {
      throw new OneLinkValidationError(
        "ONELINK_URL_INVALID",
        "Social links must use a valid http or https URL.",
      );
    }
    if (typeof entry.enabled !== "boolean") {
      throw new OneLinkValidationError(
        "ONELINK_ENABLED_INVALID",
        "Social link visibility is invalid.",
      );
    }
    rememberUrl(url);
    return {
      id,
      platform: platform.toLowerCase(),
      url: url || sanitizeLegacyUrl(entry.url),
      enabled: url ? entry.enabled : false,
      ...(url ? {} : { invalid: true }),
    };
  });

  const projects = source.projects.map((entry) => {
    if (!isPlainObject(entry)) {
      throw new OneLinkValidationError(
        "ONELINK_FEATURED_INVALID",
        "A featured link is invalid.",
      );
    }
    assertObjectKeys(
      entry,
      new Set([
        "id",
        "title",
        "description",
        "url",
        "enabled",
        "invalid",
      ]),
      "ONELINK_FEATURED_FIELDS_INVALID",
    );
    const id = validateId(entry.id, "Featured link");
    if (seenIds.has(id)) {
      throw new OneLinkValidationError(
        "ONELINK_ITEM_ID_DUPLICATE",
        "One Link item IDs must be unique.",
      );
    }
    seenIds.add(id);
    const title = validateText(
      entry.title,
      "Featured link title",
      ONE_LINK_LIMITS.featuredTitle,
      { required: true },
    );
    const description = validateText(
      entry.description,
      "Featured link description",
      ONE_LINK_LIMITS.featuredDescription,
    );
    const url = normalizeExternalUrl(entry.url);
    if (!url && (entry.enabled || entry.invalid !== true)) {
      throw new OneLinkValidationError(
        "ONELINK_URL_INVALID",
        "Featured links must use a valid http or https URL.",
      );
    }
    if (typeof entry.enabled !== "boolean") {
      throw new OneLinkValidationError(
        "ONELINK_ENABLED_INVALID",
        "Featured link visibility is invalid.",
      );
    }
    rememberUrl(url);
    return {
      id,
      title,
      description,
      url: url || sanitizeLegacyUrl(entry.url),
      enabled: url ? entry.enabled : false,
      ...(url ? {} : { invalid: true }),
    };
  });

  if (
    typeof source.published !== "boolean" ||
    typeof source.messageEnabled !== "boolean"
  ) {
    throw new OneLinkValidationError(
      "ONELINK_SETTINGS_INVALID",
      "One Link visibility settings are invalid.",
    );
  }

  return {
    expectedRevision: validateOneLinkExpectedRevision(
      payload.expectedRevision,
    ),
    displayName,
    biography,
    imageUrl,
    imagePublicId,
    wallpaperUrl,
    wallpaperPublicId,
    wallpaperTextMode: payload.wallpaperTextMode,
    settings: {
      schemaVersion: ONE_LINK_SCHEMA_VERSION,
      theme: source.theme,
      socials,
      projects,
      published: source.published,
      seoTitle: validateText(
        source.seoTitle,
        "SEO title",
        ONE_LINK_LIMITS.seoTitle,
      ),
      seoDescription: validateText(
        source.seoDescription,
        "SEO description",
        ONE_LINK_LIMITS.seoDescription,
      ),
      messageEnabled: source.messageEnabled,
    },
  };
}

export function validateOneLinkExpectedRevision(value) {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new OneLinkValidationError(
      "ONELINK_REVISION_INVALID",
      "The One Link revision is invalid.",
    );
  }
  return value;
}

export function validateOneLinkUnpublishPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new OneLinkValidationError(
      "ONELINK_PAYLOAD_INVALID",
      "One Link settings are invalid.",
    );
  }
  assertObjectKeys(
    payload,
    new Set(["expectedRevision"]),
    "ONELINK_PAYLOAD_FIELDS_INVALID",
  );
  if (!("expectedRevision" in payload)) {
    throw new OneLinkValidationError(
      "ONELINK_REVISION_INVALID",
      "The One Link revision is required.",
    );
  }
  return {
    expectedRevision: validateOneLinkExpectedRevision(
      payload.expectedRevision,
    ),
  };
}

export function serializeOneLinkProfileBio(
  existingRawBio,
  biography,
  settings,
) {
  const parsed = parseOneLinkProfileBio(existingRawBio);
  const topLevel = cloneCompatibleJson(parsed.topLevel) || {};
  const existingSettings =
    cloneCompatibleJson(parsed.rawSettings) || {};
  const unknownSettings = {};

  for (const [key, value] of Object.entries(existingSettings)) {
    if (!KNOWN_ONE_LINK_KEYS.has(key)) {
      unknownSettings[key] = value;
    }
  }

  const mergeCompatibleItems = (
    savedItems,
    existingItems,
    normalizedExistingItems,
    knownKeys,
  ) => {
    const existingArray = Array.isArray(existingItems)
      ? existingItems
      : [];
    const byId = new Map(
      existingArray
        .filter((item) => isPlainObject(item))
        .map((item) => [String(item.id || ""), item]),
    );
    normalizedExistingItems.forEach((item, index) => {
      if (existingArray[index] && !byId.has(item.id)) {
        byId.set(item.id, existingArray[index]);
      }
    });

    return savedItems.map((item, index) => {
      const existingItem =
        byId.get(item.id) || existingArray[index];
      const compatible = {};
      if (isPlainObject(existingItem)) {
        const cloned = cloneCompatibleJson(existingItem) || {};
        for (const [key, value] of Object.entries(cloned)) {
          if (!knownKeys.has(key)) compatible[key] = value;
        }
      }
      return { ...compatible, ...item };
    });
  };

  const normalizedExisting =
    normalizeOneLinkSettings(existingSettings, {
      publicationContext: parsed.hasLegacyOneLinkConfiguration
        ? "legacy"
        : "fresh",
    });
  const mergedSocials = mergeCompatibleItems(
    settings.socials,
    existingSettings.socials,
    normalizedExisting.socials,
    new Set(["id", "platform", "url", "enabled", "invalid"]),
  );
  const mergedProjects = mergeCompatibleItems(
    settings.projects,
    existingSettings.projects,
    normalizedExisting.projects,
    new Set([
      "id",
      "title",
      "description",
      "url",
      "enabled",
      "invalid",
    ]),
  );

  return JSON.stringify({
    ...topLevel,
    bio: biography,
    onelink: {
      ...unknownSettings,
      ...settings,
      socials: mergedSocials,
      projects: mergedProjects,
      schemaVersion: ONE_LINK_SCHEMA_VERSION,
    },
  });
}
