export const EXTRA_CATEGORY_MAX_INPUT_LENGTH = 240;
export const EXTRA_CATEGORY_MAX_LENGTH = 40;
export const EXTRA_CATEGORY_MIN_LENGTH = 2;

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const ANGLE_BRACKET_PATTERN = /[<>]/u;
const ALPHANUMERIC_PATTERN = /[\p{L}\p{N}]/u;

export class ExtraCategoryValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExtraCategoryValidationError";
    this.code = code;
  }
}

const asCategoryList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }
  return [];
};

export const normalizeExtraCategoryName = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  return normalized || null;
};

export const categoryIdentity = (value) => {
  const normalized = normalizeExtraCategoryName(value);
  return normalized
    ? normalized
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "")
    : "";
};

export const getPurchasedCategoryValues = ({
  category,
  categories,
} = {}) => [
  ...asCategoryList(categories),
  ...asCategoryList(category),
]
  .filter((value) => typeof value === "string")
  .map((value) => normalizeExtraCategoryName(value))
  .filter(Boolean);

// The package identifier is stored in category when skills are set up later.
// It is never a profession and must not be shown as a public skill badge.
export const getPortfolioSkillValues = ({ category, categories } = {}) => {
  const selected = asCategoryList(categories);
  const fallback = selected.length ? selected : asCategoryList(category);
  return fallback
    .filter((value) => typeof value === "string")
    .map((value) => normalizeExtraCategoryName(value))
    .filter((value) => value && categoryIdentity(value) !== "customportfolio");
};

export class CustomPortfolioSkillsValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CustomPortfolioSkillsValidationError";
  }
}

export const validateCustomPortfolioSkills = (skills) => {
  if (!Array.isArray(skills) || skills.length > 4) {
    throw new CustomPortfolioSkillsValidationError("Choose up to four skills.");
  }
  const normalized = skills.map((skill) => normalizeExtraCategoryName(skill));
  if (normalized.some((skill) =>
    !skill ||
    Array.from(skill).length < 2 ||
    Array.from(skill).length > 40 ||
    CONTROL_CHARACTER_PATTERN.test(skill) ||
    ANGLE_BRACKET_PATTERN.test(skill) ||
    categoryIdentity(skill) === "customportfolio"
  )) {
    throw new CustomPortfolioSkillsValidationError("Each skill must be 2 to 40 characters and cannot be the package name.");
  }
  if (new Set(normalized.map(categoryIdentity)).size !== normalized.length) {
    throw new CustomPortfolioSkillsValidationError("Each skill must be different.");
  }
  return normalized;
};

export const validateExtraCategoryName = (
  value,
  purchasedCategories = [],
) => {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ExtraCategoryValidationError(
      "EXTRA_CATEGORY_INVALID",
      "Enter a valid category badge.",
    );
  }

  const normalized = normalizeExtraCategoryName(value);
  const normalizedLength = normalized ? Array.from(normalized).length : 0;
  if (
    !normalized ||
    CONTROL_CHARACTER_PATTERN.test(normalized) ||
    ANGLE_BRACKET_PATTERN.test(normalized) ||
    !ALPHANUMERIC_PATTERN.test(normalized) ||
    normalizedLength > EXTRA_CATEGORY_MAX_INPUT_LENGTH
  ) {
    throw new ExtraCategoryValidationError(
      "EXTRA_CATEGORY_INVALID",
      "Enter a valid category badge up to 240 characters.",
    );
  }
  if (normalizedLength < EXTRA_CATEGORY_MIN_LENGTH) {
    throw new ExtraCategoryValidationError(
      "EXTRA_CATEGORY_TOO_SHORT",
      "Category badges must be at least 2 characters.",
    );
  }
  if (normalizedLength > EXTRA_CATEGORY_MAX_LENGTH) {
    throw new ExtraCategoryValidationError(
      "EXTRA_CATEGORY_TOO_LONG",
      "Category badges must be 40 characters or fewer.",
    );
  }

  const identity = categoryIdentity(normalized);
  const duplicate = purchasedCategories.some(
    (category) => categoryIdentity(category) === identity,
  );
  if (duplicate) {
    throw new ExtraCategoryValidationError(
      "EXTRA_CATEGORY_DUPLICATE",
      "This badge duplicates a purchased portfolio category.",
    );
  }

  return normalized;
};
