import {
  normalizeOneLinkOwnerProfile,
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
  const rowKey = options.rowKey || ((row) => row?.id);
  const expectedCount = options.expectedCount;
  const seenKeys = new Set();
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
    const pageKeys = result.data.map((row) => String(rowKey(row) || "").trim());
    if (pageKeys.some((key) => !key) || new Set(pageKeys).size !== pageKeys.length) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    }
    if (pageKeys.some((key) => seenKeys.has(key))) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    }
    pageKeys.forEach((key) => seenKeys.add(key));
    const fingerprint = pageKeys.join("|");
    if (fingerprint && signatures.has(fingerprint)) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    }
    if (fingerprint) signatures.add(fingerprint);
    rows.push(...result.data);
    if (result.data.length < pageSize) {
      if (expectedCount !== undefined && seenKeys.size !== expectedCount) {
        throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
      }
      return rows;
    }
  }
  throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
}

export function parseMoneyToKobo(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [nairaPart, koboPart = ""] = text.split(".");
  try {
    const kobo = BigInt(nairaPart) * 100n + BigInt((koboPart + "00").slice(0, 2));
    if (kobo < 0n || kobo > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(kobo);
  } catch {
    return null;
  }
}

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
  const normalized = normalizeOneLinkOwnerProfile(profile);
  if (normalized.settings.published !== true || !normalized.username) return null;
  return {
    ownerClerkId: String(profile.clerk_id || "").trim() || null,
    ownerName: String(profile.full_name || profile.username || "").trim() || "Plugsy Member",
    ownerEmail: String(profile.email || "").trim().toLowerCase() || null,
    username: normalized.username,
    displayName: normalized.displayName || null,
    publicUrl: `https://www.plugsy.ng/one/${normalized.username}`,
    avatarUrl: normalized.imageUrl,
    updatedAt: profile.one_link_updated_at || profile.updated_at || null,
    publicationSource: normalized.publicationSource,
  };
}

export function collectPublishedOneLinks(profiles) {
  const seen = new Set();
  return profiles.map(getPublishedOneLinkRecord).filter((record, index) => {
    if (!record) return false;
    const profile = profiles[index];
    const key = record.ownerClerkId || String(profile?.id || "").trim() || `username:${record.username}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.username.localeCompare(right.username));
}

export function buildOverviewMetrics({ clerkCount, profiles, orders, portfolioPurchases, chats, totalOrders = orders?.length, syncedProfiles = profiles?.length, now = new Date(), publishedOneLinks = null }) {
  if (!Number.isSafeInteger(clerkCount) || clerkCount < 0) {
    throw new AdminOverviewFailure("ADMIN_OVERVIEW_CLERK_COUNT_FAILED");
  }
  if (![profiles, orders, portfolioPurchases, chats].every(Array.isArray)) {
    throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
  }
  const paidOrders = orders.filter((order) => order.status === "paid" || order.status === "completed");
  const subscriptionKobo = paidOrders.reduce((sum, order) => {
    const amount = parseMoneyToKobo(order.amount);
    if (amount === null || !Number.isSafeInteger(sum + amount)) throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    return sum + amount;
  }, 0);
  const portfolioKobo = portfolioPurchases.reduce((sum, purchase) => {
    const amount = parseMoneyToKobo(purchase.amount);
    if (amount === null || !Number.isSafeInteger(sum + amount)) throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
    return sum + amount;
  }, 0);
  const paidKobo = subscriptionKobo + portfolioKobo;
  if (!Number.isSafeInteger(paidKobo)) throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
  const subscriptionPaidVolume = subscriptionKobo / 100;
  const portfolioPaidVolume = portfolioKobo / 100;
  const paidVolume = subscriptionPaidVolume + portfolioPaidVolume;
  const activeSubscriptions = orders.filter((order) =>
    order.status === "completed" && order.delivery_status === "login_sent" &&
    order.subscription_expires_at && new Date(order.subscription_expires_at) > now,
  ).length;
  const pendingOrders = orders.filter((order) =>
    order.status === "paid" && order.delivery_status === "pending_login" &&
    !String(order.product_name || "").toLowerCase().includes("medal"),
  ).length;
  const publishedRecords = publishedOneLinks || collectPublishedOneLinks(profiles);
  const support = countCanonicalSupportChats(chats);
  const result = {
    registeredUsers: clerkCount,
    syncedProfiles,
    totalOrders,
    subscriptionPaidVolume,
    portfolioPaidVolume,
    paidVolume,
    activeSubscriptions,
    pendingOrders,
    openSupportChats: support.openSupportChats,
    actionRequiredChats: support.actionRequiredChats,
    publishedOneLinks: publishedRecords.length,
  };
  const countMetrics = [
    result.registeredUsers,
    result.syncedProfiles,
    result.totalOrders,
    result.activeSubscriptions,
    result.pendingOrders,
    result.openSupportChats,
    result.actionRequiredChats,
    result.publishedOneLinks,
  ];
  if (countMetrics.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
  }
  if ([result.subscriptionPaidVolume, result.portfolioPaidVolume, result.paidVolume]
    .some((value) => !Number.isFinite(value) || value < 0)) {
    throw new AdminOverviewFailure("ADMIN_OVERVIEW_RESPONSE_INVALID");
  }
  return result;
}
