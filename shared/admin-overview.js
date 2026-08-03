import {
  normalizeOneLinkUsername,
  parseOneLinkProfileBio,
} from "./onelink.js";
import {
  isSupportChat,
  compareSupportChatsByActivity,
} from "../api-handlers/_supportChats.js";

export const ADMIN_OVERVIEW_PAGE_SIZE = 500;
export const ADMIN_OVERVIEW_MAX_PAGES = 100;

export class AdminOverviewFailure extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = "AdminOverviewFailure";
    this.code = code;
    this.status = status;
  }
}

export async function fetchBoundedRows(makeQuery, options = {}) {
  const pageSize = Math.min(1000, Math.max(1, Number(options.pageSize) || ADMIN_OVERVIEW_PAGE_SIZE));
  const maxPages = Math.min(ADMIN_OVERVIEW_MAX_PAGES, Math.max(1, Number(options.maxPages) || ADMIN_OVERVIEW_MAX_PAGES));
  const rows = [];
  const signatures = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    let result;
    try {
      result = await makeQuery(page * pageSize, page * pageSize + pageSize - 1);
    } catch {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    }
    if (result?.error) throw new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    if (!Array.isArray(result?.data)) throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    if (result.data.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    }
    const fingerprint = result.data.map((row) => String(row.id || "")).join("|");
    if (fingerprint && signatures.has(fingerprint)) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    }
    if (fingerprint) signatures.add(fingerprint);
    rows.push(...result.data);
    if (result.data.length < pageSize) return rows;
  }
  throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
}

const finiteAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};

export function countCanonicalSupportChats(chats) {
  const grouped = new Map();
  for (const chat of chats) {
    if (!isSupportChat(chat)) continue;
    const userId = String(chat.user_id || chat.userId || "").trim();
    if (!userId) continue;
    const list = grouped.get(userId) || [];
    list.push(chat);
    grouped.set(userId, list);
  }
  const canonical = [...grouped.values()]
    .map((entries) => [...entries].sort(compareSupportChatsByActivity)[0])
    .filter(Boolean);
  return {
    openSupportChats: canonical.filter((chat) => chat.status === "open").length,
    actionRequiredChats: canonical.filter((chat) => chat.needs_admin_attention === true).length,
  };
}

export function getPublishedOneLinkRecord(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const parsed = parseOneLinkProfileBio(profile.bio);
  const independent = profile.one_link_updated_at !== null || profile.one_link_settings !== null;
  const settings = independent
    ? (profile.one_link_settings && typeof profile.one_link_settings === "object"
      ? profile.one_link_settings
      : {})
    : parsed.settings;
  const publicationContext = independent ? "independent" : "legacy";
  const normalizedPublished = typeof settings.published === "boolean"
    ? settings.published
    : publicationContext === "legacy";
  const username = normalizeOneLinkUsername(
    independent ? profile.one_link_username : profile.username,
  );
  if (!normalizedPublished || !username) return null;
  return {
    ownerClerkId: String(profile.clerk_id || "").trim() || null,
    ownerName: String(profile.full_name || profile.username || "").trim() || "Plugsy Member",
    ownerEmail: String(profile.email || "").trim().toLowerCase() || null,
    username,
    displayName: String(
      independent ? profile.one_link_display_name : profile.full_name || "",
    ).trim() || null,
    publicUrl: `https://www.plugsy.ng/one/${username}`,
    avatarUrl: String(
      independent ? profile.one_link_avatar_url : profile.profile_pic_url || profile.image_url || "",
    ).trim() || null,
    updatedAt: profile.one_link_updated_at || profile.updated_at || null,
    publicationSource: publicationContext,
  };
}

export function buildOverviewMetrics({ clerkCount, profiles, orders, portfolioPurchases, chats, totalOrders = orders?.length, syncedProfiles = profiles?.length, now = new Date() }) {
  if (!Number.isSafeInteger(clerkCount) || clerkCount < 0) {
    throw new AdminOverviewFailure("ADMIN_OVERVIEW_CLERK_COUNT_FAILED");
  }
  if (![profiles, orders, portfolioPurchases, chats].every(Array.isArray)) {
    throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
  }
  const paidOrders = orders.filter((order) => order.status === "paid" || order.status === "completed");
  const paidVolume = paidOrders.reduce((sum, order) => sum + finiteAmount(order.amount), 0) +
    portfolioPurchases.reduce((sum, purchase) => sum + finiteAmount(purchase.amount), 0);
  const activeSubscriptions = orders.filter((order) =>
    order.status === "completed" && order.delivery_status === "login_sent" &&
    order.subscription_expires_at && new Date(order.subscription_expires_at) > now,
  ).length;
  const pendingOrders = orders.filter((order) =>
    order.status === "paid" && order.delivery_status === "pending_login" &&
    !String(order.product_name || "").toLowerCase().includes("medal"),
  ).length;
  const publishedOwners = new Set();
  for (const profile of profiles) {
    const record = getPublishedOneLinkRecord(profile);
    if (record?.ownerClerkId) publishedOwners.add(record.ownerClerkId);
  }
  const support = countCanonicalSupportChats(chats);
  return {
    registeredUsers: clerkCount,
    syncedProfiles,
    totalOrders,
    paidVolume,
    activeSubscriptions,
    pendingOrders,
    openSupportChats: support.openSupportChats,
    actionRequiredChats: support.actionRequiredChats,
    publishedOneLinks: publishedOwners.size,
  };
}
