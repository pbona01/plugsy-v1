import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto";
import { Resend } from 'resend';
import {
  isSupportChat,
  resolveExistingSupportChat,
  resolveOrCreateSupportChat,
} from "./_supportChats.js";
import { requireVerifiedClerkUser } from "../api/_clerkAuth.js";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { reconcileWalletFunding } from "../api/_walletFundingWebhook.js";
import { deterministicEventUuid, sendOneSignal } from "../api/_oneSignal.js";
import { resolveCanonicalClerkId } from "../api/_recipient.js";
import {
  AdminOverviewFailure,
  buildOverviewMetrics,
  fetchBoundedRows,
  collectPublishedOneLinks,
} from "../shared/admin-overview.js";

const getClient = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("ADMIN_API_CONFIG_REQUIRED");
  return createClient(url, serviceRoleKey, {
    db: {
      schema: "public"
    },
    global: {
      headers: { "x-connection-encrypted": "true" }
    }
  });
};

const textValue = (value) => String(value || "").trim();
const normalizeEmail = (value) => textValue(value).toLowerCase();
const normalizeRole = (value) => textValue(value).toLowerCase() || "user";
const normalizeAdminDisplayRole = (value) =>
  normalizeRole(value) === "admin" ? "admin" : "user";
const toIsoDate = (value) => {
  if (!value) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const CLERK_PAGE_SIZE = 100;
const MAX_CLERK_PAGES = 100;
const MAX_CLERK_RECORDS = 10_000;
const PROFILE_PAGE_SIZE = 1000;
const MAX_PROFILE_PAGES = 50;
const ADMIN_DASHBOARD_PAGE_SIZE = 250;

export class AdminUsersFailure extends Error {
  constructor(code, status = 503, details = {}) {
    super(code);
    this.name = "AdminUsersFailure";
    this.code = code;
    this.status = status;
    this.providerStatus = details.providerStatus || null;
    this.retryAfter = details.retryAfter || null;
  }
}

const canonicalClerkId = (value) => {
  const candidate = textValue(value);
  return /^user_[A-Za-z0-9_-]{3,}$/.test(candidate)
    ? candidate
    : "";
};

const clerkPageData = (payload) => {
  if (Array.isArray(payload)) return { users: payload, total: null };
  if (!payload || typeof payload !== "object") return null;
  const users = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.users)
      ? payload.users
      : null;
  if (!users) return null;
  const totalValue = payload.total_count ?? payload.totalCount ?? payload.total;
  const total = Number.isFinite(Number(totalValue)) ? Number(totalValue) : null;
  return { users, total };
};

const retryAfterSeconds = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.min(3600, Math.ceil(numeric));
  }
  const date = Date.parse(String(value || ""));
  if (!Number.isFinite(date)) return null;
  return Math.min(3600, Math.max(0, Math.ceil((date - Date.now()) / 1000)));
};

export async function fetchAllClerkUsers(
  fetchImpl = fetch,
  options = {},
) {
  const secretKey = textValue(
    options.secretKey ?? process.env.CLERK_SECRET_KEY,
  );
  if (!secretKey || secretKey === "your_clerk_secret_key" || secretKey.startsWith("your_")) {
    throw new AdminUsersFailure("ADMIN_USERS_CONFIGURATION_ERROR", 503);
  }

  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || CLERK_PAGE_SIZE));
  const maxPages = Math.min(MAX_CLERK_PAGES, Math.max(1, Number(options.maxPages) || MAX_CLERK_PAGES));
  const maxRecords = Math.min(MAX_CLERK_RECORDS, Math.max(1, Number(options.maxRecords) || MAX_CLERK_RECORDS));
  const users = [];
  const seenIds = new Set();
  const seenPages = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let payload;
    try {
      const response = await fetchImpl(
        `https://api.clerk.com/v1/users?limit=${pageSize}&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: controller.signal,
        },
      );
      if (!response || typeof response.ok !== "boolean") {
        throw new AdminUsersFailure("ADMIN_USERS_LOOKUP_FAILED", 503);
      }
      if (!response.ok) {
        const providerStatus = Number(response.status) || null;
        if (providerStatus === 401 || providerStatus === 403) {
          throw new AdminUsersFailure(
            "ADMIN_USERS_PROVIDER_UNAUTHORIZED",
            502,
            { providerStatus },
          );
        }
        if (providerStatus === 429) {
          throw new AdminUsersFailure("ADMIN_USERS_RATE_LIMITED", 429, {
            providerStatus,
            retryAfter: retryAfterSeconds(response.headers?.get?.("retry-after")),
          });
        }
        throw new AdminUsersFailure("ADMIN_USERS_LOOKUP_FAILED", 503, {
          providerStatus,
        });
      }
      payload = await response.json().catch(() => null);
    } catch (error) {
      if (error instanceof AdminUsersFailure) throw error;
      throw new AdminUsersFailure("ADMIN_USERS_LOOKUP_FAILED", 503);
    } finally {
      clearTimeout(timeout);
    }
    const parsed = clerkPageData(payload);
    if (!parsed) {
      throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
    }
    const pageUsers = [];
    for (const user of parsed.users) {
      if (!user || typeof user !== "object" || Array.isArray(user)) {
        throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
      }
      const clerkId = canonicalClerkId(user.id);
      if (!clerkId) {
        throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
      }
      if (seenIds.has(clerkId)) continue;
      seenIds.add(clerkId);
      pageUsers.push(user);
    }
    const fingerprint = parsed.users
      .map((user) => canonicalClerkId(user?.id))
      .join("|");
    if (fingerprint && seenPages.has(fingerprint)) {
      throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
    }
    if (fingerprint) seenPages.add(fingerprint);
    users.push(...pageUsers);
    if (users.length > maxRecords) {
      throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
    }
    if (parsed.total !== null && users.length >= parsed.total) {
      return users;
    }
    if (parsed.users.length < pageSize) {
      if (parsed.total !== null && users.length < parsed.total) {
        throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
      }
      return users;
    }
  }
  throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
}

export async function fetchAllProfiles(supabase, options = {}) {
  const pageSize = Math.min(PROFILE_PAGE_SIZE, Math.max(1, Number(options.pageSize) || PROFILE_PAGE_SIZE));
  const maxPages = Math.min(MAX_PROFILE_PAGES, Math.max(1, Number(options.maxPages) || MAX_PROFILE_PAGES));
  const profiles = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,clerk_id,email,full_name,username,wallet_tag,role,image_url,profile_pic_url,last_login_at,created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new AdminUsersFailure("ADMIN_USERS_LOOKUP_FAILED", 503);
    if (!Array.isArray(data)) {
      throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
    }
    profiles.push(...data);
    if (data.length < pageSize) return profiles;
  }
  throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
}

const primaryClerkEmail = (user) => {
  const candidateAddresses = user.email_addresses || user.emailAddresses;
  const addresses = Array.isArray(candidateAddresses)
    ? candidateAddresses.filter(
        (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
  const primaryId = user.primary_email_address_id || user.primaryEmailAddressId;
  return normalizeEmail(
    addresses.find((entry) => (entry.id || entry.emailAddressId) === primaryId)?.email_address ||
      addresses.find((entry) => (entry.id || entry.emailAddressId) === primaryId)?.emailAddress ||
      addresses[0]?.email_address ||
      addresses[0]?.emailAddress,
  );
};

export function normalizeAdminUsers(clerkUsers, profiles) {
  const profilesByClerkId = new Map();
  for (const profile of profiles) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;
    const clerkId = canonicalClerkId(profile.clerk_id);
    if (clerkId && !profilesByClerkId.has(clerkId)) profilesByClerkId.set(clerkId, profile);
  }

  const claimedProfiles = new Set();
  const normalized = [];
  const seenClerkIds = new Set();
  const seenProfileIds = new Set();

  for (const clerkUser of clerkUsers) {
    if (!clerkUser || typeof clerkUser !== "object" || Array.isArray(clerkUser)) continue;
    const clerkId = canonicalClerkId(clerkUser.id);
    const email = primaryClerkEmail(clerkUser);
    if (!clerkId || seenClerkIds.has(clerkId)) continue;

    const profile = profilesByClerkId.get(clerkId) || null;
    const profileId = textValue(profile?.id);
    if (profileId) {
      claimedProfiles.add(profileId);
      seenProfileIds.add(profileId);
    }

    const firstName = textValue(clerkUser.first_name || clerkUser.firstName);
    const lastName = textValue(clerkUser.last_name || clerkUser.lastName);
    const clerkUsername = textValue(clerkUser.username);
    const fullName = textValue(`${firstName} ${lastName}`) || clerkUsername || email.split("@")[0] || "Plugsy Member";
    const clerkRole = clerkUser.public_metadata?.role ?? clerkUser.publicMetadata?.role;
    const role =
      normalizeAdminDisplayRole(clerkRole) === "admin" ||
      normalizeAdminDisplayRole(profile?.role) === "admin"
        ? "admin"
        : "user";

    normalized.push({
      id: profileId || clerkId,
      profile_id: profileId || null,
      clerk_id: clerkId,
      clerk_linked: true,
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      clerk_username: clerkUsername || null,
      username: clerkUsername || textValue(profile?.username) || null,
      wallet_tag: textValue(profile?.wallet_tag) || null,
      imageUrl: textValue(clerkUser.image_url || clerkUser.imageUrl),
      created_at: toIsoDate(clerkUser.created_at || clerkUser.createdAt),
      last_login_at: toIsoDate(clerkUser.last_sign_in_at || clerkUser.lastSignInAt),
      role,
    });
    seenClerkIds.add(clerkId);
  }

  for (const profile of profiles) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;
    const profileId = textValue(profile.id);
    if (!profileId || seenProfileIds.has(profileId)) continue;
    const email = normalizeEmail(profile.email);
    const clerkId = canonicalClerkId(profile.clerk_id);
    if (claimedProfiles.has(profileId) || (clerkId && seenClerkIds.has(clerkId))) continue;
    normalized.push({
      id: profileId,
      profile_id: profileId,
      clerk_id: clerkId || null,
      clerk_linked: false,
      email,
      first_name: null,
      last_name: null,
      full_name: textValue(profile.full_name) || textValue(profile.username) || "Legacy Profile",
      clerk_username: null,
      username: textValue(profile.username) || null,
      wallet_tag: textValue(profile.wallet_tag) || null,
      imageUrl: textValue(profile.profile_pic_url || profile.image_url),
      created_at: toIsoDate(profile.created_at),
      last_login_at: toIsoDate(profile.last_login_at),
      role: normalizeAdminDisplayRole(profile.role),
    });
    seenProfileIds.add(profileId);
    if (clerkId) seenClerkIds.add(clerkId);
  }

  return normalized.sort((left, right) => {
    const dateDifference =
      (Date.parse(right.created_at || "") || 0) -
      (Date.parse(left.created_at || "") || 0);
    if (dateDifference) return dateDifference;
    return String(left.clerk_id || left.id).localeCompare(
      String(right.clerk_id || right.id),
    );
  });
}

const ADMIN_MESSAGE_INSERT_FIELDS = new Set([
  "chat_id",
  "sender_id",
  "sender_name",
  "sender_role",
  "content",
  "attachment_url",
  "attachment_type",
  "message_type",
  "audio_url",
  "read_by_admin",
  "read_by_user",
  "order_id",
  "user_id",
  "is_bot",
]);

async function requireSupportWriter(req, res, supabase) {
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("clerk_id", actor.userId)
    .maybeSingle();
  if (profileError) {
    res.status(503).json({ error: "SUPPORT_WRITER_LOOKUP_FAILED" });
    return null;
  }

  const clerkRole = String(
    actor.clerkUser?.publicMetadata?.role ||
      actor.clerkUser?.public_metadata?.role ||
      "",
  ).toLowerCase();
  return {
    actor,
    isAdmin:
      String(profile?.role || "").toLowerCase() === "admin" ||
      clerkRole === "admin",
  };
}

async function requireVerifiedAdmin(req, res, supabase) {
  const writer = await requireSupportWriter(req, res, supabase);
  if (!writer) return null;
  if (!writer.isAdmin) {
    res.status(403).json({
      success: false,
      error: "ADMIN_REQUIRED",
    });
    return null;
  }
  return writer;
}

const getAdminUsersClient = () => {
  const supabaseUrl = textValue(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  );
  const serviceRoleKey = textValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new AdminUsersFailure("ADMIN_USERS_CONFIGURATION_ERROR", 503);
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
};

async function handlePortfolioShare(req, res) {
  const supabase = getClient();
  const writer = await requireVerifiedAdmin(req, res, supabase);
  if (!writer) return;

  if (req.method === "GET") {
    const [{ data: portfolios, error: portfolioError }, { data: profiles, error: profileError }] = await Promise.all([
      supabase.from("vp_portfolios").select("id,slug,full_name,category,status,user_id").order("updated_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("clerk_id,email,full_name,username,role").order("created_at", { ascending: false }).limit(2000),
    ]);
    if (portfolioError || profileError) return res.status(503).json({ success: false, error: "PORTFOLIO_SHARE_OPTIONS_FAILED" });
    return res.status(200).json({ success: true, portfolios: portfolios || [], users: (profiles || []).filter((profile) => profile.clerk_id && profile.role !== "admin") });
  }

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST is required." });
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const category = textValue(body?.category);
  const recipientUserId = textValue(body?.recipientUserId);
  if (!category || !recipientUserId) return res.status(400).json({ success: false, error: "Select a category and recipient." });

  const [{ data: portfolio, error: portfolioError }, { data: recipient, error: recipientError }] = await Promise.all([
    supabase.from("vp_portfolios").select("id,slug,full_name,status,category").eq("category", category).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("clerk_id,email,full_name,username").eq("clerk_id", recipientUserId).maybeSingle(),
  ]);
  if (portfolioError || !portfolio) return res.status(404).json({ success: false, error: "No portfolio found for that category." });
  if (recipientError || !recipient) return res.status(404).json({ success: false, error: "Recipient not found." });

  const { data: senderProfile } = await supabase.from("profiles").select("full_name,username,email").eq("clerk_id", writer.actor.userId).maybeSingle();
  const { data: senderMemberships } = await supabase.from("chat_members").select("chat_id").eq("user_id", writer.actor.userId);
  const senderChatIds = (senderMemberships || []).map((membership) => membership.chat_id).filter(Boolean);
  let chatId = null;
  if (senderChatIds.length) {
    const { data: sharedMembership } = await supabase.from("chat_members").select("chat_id").in("chat_id", senderChatIds).eq("user_id", recipientUserId).limit(1);
    chatId = sharedMembership?.[0]?.chat_id || null;
  }
  if (!chatId) {
    const { data: chat, error: chatError } = await supabase.from("chats").insert({ chat_type: "dm", member_count: 2 }).select("id").single();
    if (chatError) return res.status(503).json({ success: false, error: "Could not create delivery chat." });
    chatId = chat.id;
    const { error: memberError } = await supabase.from("chat_members").insert([
      { chat_id: chatId, user_id: writer.actor.userId, user_email: senderProfile?.email || writer.actor.email || "", user_name: senderProfile?.full_name || senderProfile?.username || writer.actor.fullName || "Plugsy Admin", role: "member" },
      { chat_id: chatId, user_id: recipientUserId, user_email: recipient.email || "", user_name: recipient.full_name || recipient.username || "User", role: "member" },
    ]);
    if (memberError) return res.status(503).json({ success: false, error: "Could not add delivery recipient." });
  }

  const portfolioUrl = `/vp/${portfolio.slug}`;
  const { error: messageError } = await supabase.from("messages").insert({
    chat_id: chatId,
    sender_id: writer.actor.userId,
    sender_role: "admin",
    sender_name: senderProfile?.full_name || senderProfile?.username || writer.actor.fullName || "Plugsy Admin",
    content: `Plugsy shared a ${category.replaceAll("_", " ")} portfolio with you: ${portfolio.full_name || "View portfolio"}\n${portfolioUrl}`,
    attachment_url: portfolioUrl,
    attachment_type: "portfolio",
    message_type: "text",
    user_id: recipientUserId,
    is_bot: false,
    read_by_admin: true,
    read_by_user: false,
  });
  if (messageError) return res.status(503).json({ success: false, error: "Portfolio could not be sent." });
  return res.status(200).json({ success: true, chatId, portfolioUrl });
}

async function authorizeAdminUsersActor(actor, res, supabase) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("clerk_id", actor.userId)
    .maybeSingle();
  if (error) {
    res.status(503).json({
      success: false,
      code: "ADMIN_USERS_LOOKUP_FAILED",
      error: "The admin user service is temporarily unavailable.",
    });
    return false;
  }
  const clerkRole = normalizeRole(
    actor.clerkUser?.publicMetadata?.role ||
      actor.clerkUser?.public_metadata?.role ||
      "",
  );
  const profileRole = normalizeRole(profile?.role || "");
  if (clerkRole !== "admin" && profileRole !== "admin") {
    res.status(403).json({
      success: false,
      code: "ADMIN_ACCESS_DENIED",
      error: "This account does not have admin access.",
    });
    return false;
  }
  return true;
}

async function handleSendLoginEmail(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {}
    }
    parsedBody = parsedBody || {};
    
    const { orderId, loginDetails } = parsedBody;

    console.log("[send-login] STARTING for order:", orderId)

    if (!orderId || !loginDetails) {
      return res.status(400).json({ success: false, error: "Missing orderId or loginDetails" })
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, user_email, product_name, plan_name, plan_months")
      .eq("id", orderId)
      .single()

    if (orderErr || !order) {
      console.error("[send-login] order lookup failed", { orderId })
      return res.status(404).json({ success: false, error: "Order not found" })
    }

    let supportChat;
    try {
      supportChat = await resolveOrCreateSupportChat(
        supabase,
        order.user_id,
        order.user_email
      );
    } catch {
      console.error("[send-login] support chat resolution failed", { orderId });
      return res.status(500).json({
        success: false,
        error: "Support timeline unavailable"
      });
    }

    // STEP 1: Update order (critical — must succeed)
    console.log("[send-login] STEP 1: updating order")
    const months = order.plan_months || 1;
    const subscriptionExpiresAt = new Date(Date.now() + (months * 29 * 24 * 60 * 60 * 1000)).toISOString();

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "completed",
        delivery_status: "login_sent",
        logins: loginDetails,
        logins_sent_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_by: writer.actor.userId,
        updated_at: new Date().toISOString(),
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: subscriptionExpiresAt
      })
      .eq("id", orderId)

    if (updateError) {
      console.error("[send-login] order update failed", { orderId })
      return res.status(500).json({ success: false, error: "ORDER_UPDATE_FAILED" })
    }
    console.log("[send-login] ✅ order updated")

    // STEP 2: Chat message (isolated)
    try {
      const { error: messageError } = await supabase.from("messages").insert({
        chat_id: supportChat.id,
        sender_id: writer.actor.userId,
        sender_role: "admin",
        sender_name: writer.actor.email || "Plugsy Team",
        content: loginDetails,
        user_id: supportChat.user_id,
        user_email: order.user_email,
        is_from_user: false,
        is_bot: false,
        read_by_admin: true,
        read_by_user: false
      });
      if (messageError) throw new Error("SUPPORT_MESSAGE_INSERT_FAILED");

      const { error: summaryError } = await supabase
        .from("chats")
        .update({
          last_message: "Login details sent",
          last_message_at: new Date().toISOString(),
          needs_admin_attention: false
        })
        .eq("id", supportChat.id);
      if (summaryError) {
        console.error("[send-login] support chat summary update failed", {
          orderId,
          chatId: supportChat.id
        });
      }

      console.log("[send-login] chat message sent", {
        orderId,
        chatId: supportChat.id
      });
    } catch {
      console.error("[send-login] chat message failed", {
        orderId,
        code: "SUPPORT_TIMELINE_WRITE_FAILED"
      });
      return res.status(500).json({
        success: false,
        error: "Support timeline delivery failed"
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
      process.env.SITE_URL || "https://www.plugsy.ng"

    // STEP 3: EMAIL (isolated)
    try {
      if (process.env.RESEND_API_KEY) {
        console.log("[send-login] sending email via Resend...")
        
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.RESEND_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Plugsy <noreply@plugsy.ng>",
            to: order.user_email,
            subject: "🔑 Your " + (order.product_name || "CapCut Pro") + 
              " login is ready!",
            html: 
              "<div style='font-family: sans-serif; padding: 20px;'>" +
              "<h2>Your login details are ready</h2>" +
              "<p>Hi there,</p>" +
              "<p>Your " + (order.product_name || "CapCut Pro") + 
              " subscription has been activated. Here are your details:</p>" +
              "<div style='background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;'>" +
              "<pre style='white-space: pre-wrap; font-family: monospace;'>" + 
              loginDetails + "</pre>" +
              "</div>" +
              "<p>You can also view this anytime in your " +
              "<a href='" + siteUrl + "/dashboard/messages'>Plugsy messages</a>.</p>" +
              "<p>— Team Plugsy</p>" +
              "</div>"
          })
        })

        await emailRes.json().catch(() => null)
        console.log("[send-login] email response status:", emailRes.status)

        if (!emailRes.ok) {
          console.error("[send-login] email delivery failed", {
            status: emailRes.status
          })
        } else {
          console.log("[send-login] ✅ email sent")
        }
      } else {
        console.warn("[send-login] ⚠️ RESEND_API_KEY not set, skipping email")
      }
    } catch {
      console.error("[send-login] email delivery crashed", { orderId })
    }

    // STEP 4: TELEGRAM to admin (isolated)
    try {
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN
      const telegramChatId = process.env.TELEGRAM_CHAT_ID

      if (telegramToken && telegramChatId) {
        const tgRes = await fetch(
          "https://api.telegram.org/bot" + telegramToken + "/sendMessage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: "✅ Login sent to: " + order.user_email + 
                "\nProduct: " + (order.product_name || "CapCut Pro")
            })
          }
        )
        const tgData = await tgRes.json()
        
        if (!tgData.ok) {
          console.error("[send-login] Telegram delivery failed", {
            orderId,
            status: tgRes.status,
          })
        } else {
          console.log("[send-login] ✅ telegram sent")
        }
      } else {
        console.warn("[send-login] ⚠️ Telegram env vars missing, skipping")
      }
    } catch {
      console.error("[send-login] Telegram delivery crashed", { orderId })
    }

    // STEP 5: OneSignal push notification (isolated)
    try {
      const recipient = await resolveCanonicalClerkId(supabase, order.user_id, order.user_email);
      if (recipient) await sendOneSignal({ title: "Your login is ready", body: "Your login details are ready. Check your Plugsy messages.", url: "/dashboard/messages", targeting: { include_aliases: { external_id: [recipient] } }, requestKey: deterministicEventUuid("login-ready", order.id) });
      else console.warn("[send-login] push skipped", { code: "RECIPIENT_UNRESOLVED" });
    } catch {
      console.warn("[send-login] push delivery failed", { code: "PUSH_SECONDARY_EFFECT_FAILED" })
    }

    console.log("[send-login] ============ ALL STEPS COMPLETE ============")
    return res.status(200).json({ success: true, message: "Login sent" })

  } catch {
    console.error("[send-login] request failed")
    return res.status(500).json({ success: false, error: "SEND_LOGIN_FAILED" })
  }
}

async function handleBroadcastEmail(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {}
    }
    parsedBody = parsedBody || {};

    const { subject, html, recipientEmails, broadcastAll } = parsedBody;

    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    if (!subject || !html) {
      return res.status(400).json({ success: false, error: "Missing subject or content" });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey || resendApiKey === "re_mock_key") {
      return res.status(500).json({ success: false, error: "Resend API key not configured" });
    }

    const resend = new Resend(resendApiKey);

    // Formatted elegant HTML
    const formattedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #030303;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #030303;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .header {
      padding: 40px 30px;
      text-align: center;
      border-bottom: 1px solid #1a1a1a;
      background: linear-gradient(180deg, #0d0d0d 0%, #080808 100%);
    }
    .logo {
      font-size: 28px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.05em;
      text-decoration: none;
      text-transform: uppercase;
      margin: 0;
    }
    .logo-dot {
      color: #3b82f6;
    }
    .content {
      padding: 40px 35px;
      color: #cccccc;
      font-size: 15px;
      line-height: 1.8;
    }
    .content p {
      margin: 0 0 20px 0;
    }
    .footer {
      padding: 30px;
      background-color: #080808;
      border-top: 1px solid #1a1a1a;
      text-align: center;
      font-size: 11px;
      color: #555555;
    }
    .footer p {
      margin: 0 0 10px 0;
    }
    .footer a {
      color: #888888;
      text-decoration: none;
      font-weight: 600;
    }
    .footer a:hover {
      color: #ffffff;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">PLUGSY<span class="logo-dot">.</span></div>
      </div>
      <div class="content">
        ${html.split("\n").map(paragraph => paragraph.trim() ? `<p>${paragraph}</p>` : "").join("")}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Plugsy Nigeria. All rights reserved.</p>
        <p>Premium digital tool subscriptions at the best rates.</p>
        <p>
          <a href="https://www.plugsy.ng">Visit Website</a> &nbsp;|&nbsp; 
          <a href="https://www.plugsy.ng/dashboard">Your Dashboard</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;

    let recipients = Array.isArray(recipientEmails) ? recipientEmails : [];
    if (broadcastAll === true) {
      const allEmails = [];
      const pageSize = 1000;
      for (let from = 0; from < 100000; from += pageSize) {
        const { data, error } = await supabase
          .from("profiles")
          .select("email")
          .not("email", "is", null)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allEmails.push(...(data || []).map((row) => normalizeEmail(row.email)).filter(Boolean));
        if (!data || data.length < pageSize) break;
      }
      recipients = [...new Set(allEmails)];
    }
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: "No recipients provided" });
    }

    const batchSize = 50;
    const results = [];
    const errors = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      try {
        const { data, error } = await resend.emails.send({
          from: "Plugsy <hello@plugsy.ng>",
          to: "hello@plugsy.ng",
          bcc: batch,
          subject: subject,
          html: formattedHtml,
        });
        results.push({ data, error });
        if (error) errors.push(error);
      } catch (err) {
        errors.push(err.message);
      }
    }

    if (errors.length > 0) {
      console.error("[broadcast] email delivery failures", {
        count: errors.length,
      });
    }

    return res.status(200).json({
      success: true,
      recipientCount: recipients.length,
      resultsCount: results.length,
      errorCount: errors.length
    });

  } catch {
    console.error("[broadcast] request failed");
    return res.status(500).json({ success: false, error: "BROADCAST_FAILED" });
  }
}

async function handleAdd(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const parsedBody =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { collection, data } = parsedBody;
    if (!collection || !data) return res.status(400).json({ error: "Missing required fields" });
    if (collection !== "messages") {
      return res.status(403).json({ error: "COLLECTION_NOT_ALLOWED" });
    }
    if (
      Object.keys(data).some(
        (field) => !ADMIN_MESSAGE_INSERT_FIELDS.has(field),
      )
    ) {
      return res.status(400).json({ error: "MESSAGE_FIELDS_INVALID" });
    }
    const supabase = getClient();
    const writer = await requireSupportWriter(req, res, supabase);
    if (!writer) return;

    const chatId = String(data.chat_id || "").trim();
    if (!chatId) {
      return res.status(400).json({ error: "CHAT_ID_REQUIRED" });
    }

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, user_id, chat_type")
      .eq("id", chatId)
      .maybeSingle();
    if (chatError) {
      return res.status(500).json({ error: "CHAT_LOOKUP_FAILED" });
    }
    if (!chat) return res.status(404).json({ error: "CHAT_NOT_FOUND" });

    const senderRole = String(data.sender_role || "").toLowerCase();
    if (!["admin", "system", "bot"].includes(senderRole)) {
      return res.status(403).json({
        error: "SUPPORT_WRITER_ROLE_INVALID",
      });
    }

    const supportChat = isSupportChat(chat);
    const isConversationOwner =
      supportChat && writer.actor.userId === chat.user_id;
    if (
      !writer.isAdmin &&
      (senderRole === "admin" || !isConversationOwner)
    ) {
      return res.status(403).json({ error: "SUPPORT_WRITE_FORBIDDEN" });
    }

    const insertData = {
      ...data,
      chat_id: chat.id,
      sender_id:
        senderRole === "admin" ? writer.actor.userId : data.sender_id,
    };
    if (supportChat) {
      if (!String(chat.user_id || "").startsWith("user_")) {
        return res.status(500).json({ error: "SUPPORT_CHAT_OWNER_REQUIRED" });
      }
      const canonical = await resolveExistingSupportChat(
        supabase,
        chat.user_id,
      );
      if (!canonical.chat) {
        return res.status(404).json({ error: "SUPPORT_CHAT_NOT_FOUND" });
      }
      if (canonical.chat.id !== chat.id) {
        return res.status(409).json({ error: "SUPPORT_CHAT_NOT_CANONICAL" });
      }
      insertData.user_id = canonical.canonicalUserId;
    }

    const { data: result, error } = await supabase
      .from("messages")
      .insert([insertData])
      .select()
      .maybeSingle();
    if (error) throw error;
    return res.json({ success: true, id: result?.id });
  } catch {
    console.error("[admin-add] insert failed");
    return res.status(500).json({ error: "INSERT_FAILED" });
  }
}

async function handleUpdate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { collection, id, data } = body;
    if (!collection || !id || !data) return res.status(400).json({ error: "Missing required fields" });
    if (collection !== "chats") {
      return res.status(403).json({ error: "COLLECTION_NOT_ALLOWED" });
    }

    const supabase = getClient();
    const writer = await requireSupportWriter(req, res, supabase);
    if (!writer) return;

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, user_id, chat_type")
      .eq("id", id)
      .maybeSingle();
    if (chatError) {
      return res.status(500).json({ error: "CHAT_LOOKUP_FAILED" });
    }
    if (!chat) return res.status(404).json({ error: "CHAT_NOT_FOUND" });

    const supportChat = isSupportChat(chat);
    if (
      !writer.isAdmin &&
      (!supportChat || writer.actor.userId !== chat.user_id)
    ) {
      return res.status(403).json({ error: "CHAT_UPDATE_FORBIDDEN" });
    }

    const allowedKeys = new Set(
      writer.isAdmin
        ? [
            "last_message",
            "last_message_at",
            "needs_admin_attention",
            "updated_at",
            "status",
            "unread_count",
            "assigned_admin_id",
          ]
        : [
            "last_message",
            "last_message_at",
            "needs_admin_attention",
            "updated_at",
          ],
    );
    const updateFields = Object.keys(data);
    if (
      updateFields.length === 0 ||
      updateFields.some((key) => !allowedKeys.has(key))
    ) {
      return res.status(400).json({
        error: "CHAT_UPDATE_FIELDS_INVALID",
      });
    }

    const { error } = await supabase
      .from("chats")
      .update(data)
      .eq("id", id);
    if (error) throw error;
    return res.json({ success: true });
  } catch {
    console.error("[admin-update] update failed");
    return res.status(500).json({ error: "UPDATE_FAILED" });
  }
}

async function handleDelete(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  return res.status(405).json({ error: "ADMIN_DELETE_DISABLED" });
}

async function handleListSubscriptions(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: subscriptions, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(ADMIN_DASHBOARD_PAGE_SIZE);

    if (error) throw error;
    return res.status(200).json({ success: true, subscriptions });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_SUBSCRIPTIONS_FAILED" });
  }
}

async function handleListProfiles(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(ADMIN_DASHBOARD_PAGE_SIZE);

    if (error) throw error;
    return res.status(200).json({ success: true, profiles });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_PROFILES_FAILED" });
  }
}

export async function handleOverviewMetrics(req, res, dependencies = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", error: "GET is required." });
  }
  if (!/^Bearer\s+\S+$/i.test(textValue(req.headers?.authorization))) {
    return res.status(401).json({ success: false, code: "ADMIN_AUTH_REQUIRED", error: "Sign-in is required." });
  }
  try {
    const authenticate = dependencies.authenticate || requireVerifiedClerkUser;
    const actor = await authenticate(req, res);
    if (!actor) return;
    const supabase = dependencies.supabase || getAdminUsersClient();
    const authorize = dependencies.authorize || authorizeAdminUsersActor;
    if (!(await authorize(actor, res, supabase))) return;
    if (!textValue(dependencies.secretKey ?? process.env.CLERK_SECRET_KEY)) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_CLERK_CONFIGURATION_ERROR");
    }
    const clerk = dependencies.clerkClient || clerkClient;
    let clerkCountResult;
    try {
      clerkCountResult = await (dependencies.getClerkCount
        ? dependencies.getClerkCount()
        : clerk.users.getCount());
    } catch {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_CLERK_COUNT_FAILED");
    }
    const registeredUsers = Number(
      typeof clerkCountResult === "number" ? clerkCountResult : clerkCountResult?.count,
    );
    if (!Number.isSafeInteger(registeredUsers) || registeredUsers < 0) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_CLERK_COUNT_FAILED");
    }
    const profileCountResult = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (profileCountResult?.error || !Number.isSafeInteger(profileCountResult?.count) || profileCountResult.count < 0) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    }
    const orderCountResult = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true });
    if (orderCountResult?.error || !Number.isSafeInteger(orderCountResult?.count) || orderCountResult.count < 0) {
      throw new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    }
    const profiles = await fetchBoundedRows((from, to) => supabase
      .from("profiles")
      .select("id,clerk_id,email,full_name,username,bio,profile_pic_url,image_url,last_login_at,one_link_username,one_link_display_name,one_link_avatar_url,one_link_settings,one_link_updated_at,updated_at")
      .order("id", { ascending: true })
      .range(from, to), { expectedCount: profileCountResult.count });
    const orders = await fetchBoundedRows((from, to) => supabase
      .from("orders")
      .select("id,status,amount,delivery_status,product_name,subscription_expires_at,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to), { expectedCount: orderCountResult.count });
    const portfolioCountResult = await supabase.from("portfolio_purchases").select("id", { count: "exact", head: true });
    if (portfolioCountResult?.error || !Number.isSafeInteger(portfolioCountResult?.count) || portfolioCountResult.count < 0) throw new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    const portfolioPurchases = await fetchBoundedRows((from, to) => supabase
      .from("portfolio_purchases")
      .select("id,amount,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to), { expectedCount: portfolioCountResult.count });
    const chatsCountResult = await supabase.from("chats").select("id", { count: "exact", head: true });
    if (chatsCountResult?.error || !Number.isSafeInteger(chatsCountResult?.count) || chatsCountResult.count < 0) throw new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    const chats = await fetchBoundedRows((from, to) => supabase
      .from("chats")
      .select("id,user_id,chat_type,status,needs_admin_attention,last_message_at,updated_at,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to), { expectedCount: chatsCountResult.count });
    const metrics = buildOverviewMetrics({
      clerkCount: registeredUsers,
      profiles,
      orders,
      portfolioPurchases,
      chats,
      publishedOneLinks: collectPublishedOneLinks(profiles),
      totalOrders: orderCountResult.count,
      syncedProfiles: profileCountResult.count,
    });
    return res.status(200).json({ success: true, metrics, updatedAt: new Date().toISOString() });
  } catch (error) {
    const failure = error instanceof AdminOverviewFailure
      ? error
      : new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    const messages = {
      ADMIN_OVERVIEW_CLERK_CONFIGURATION_ERROR: "The overview user service is not configured.",
      ADMIN_OVERVIEW_CLERK_COUNT_FAILED: "Registered users are temporarily unavailable.",
      ADMIN_OVERVIEW_DATABASE_ERROR: "Overview metrics are temporarily unavailable.",
      ADMIN_OVERVIEW_RESPONSE_INVALID: "The overview service returned an invalid response.",
    };
    return res.status(failure.status).json({ success: false, code: failure.code, error: messages[failure.code] || messages.ADMIN_OVERVIEW_DATABASE_ERROR });
  }
}

export async function handleListPublishedOneLinks(req, res, dependencies = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", error: "GET is required." });
  if (!/^Bearer\s+\S+$/i.test(textValue(req.headers?.authorization))) {
    return res.status(401).json({ success: false, code: "ADMIN_AUTH_REQUIRED", error: "Sign-in is required." });
  }
  try {
    const actor = await (dependencies.authenticate || requireVerifiedClerkUser)(req, res);
    if (!actor) return;
    const supabase = dependencies.supabase || getAdminUsersClient();
    if (!await (dependencies.authorize || authorizeAdminUsersActor)(actor, res, supabase)) return;
    const profileCountResult = await supabase.from("profiles").select("id", { count: "exact", head: true });
    if (profileCountResult?.error || !Number.isSafeInteger(profileCountResult?.count) || profileCountResult.count < 0) throw new AdminOverviewFailure("ADMIN_OVERVIEW_DATABASE_ERROR");
    const profiles = await fetchBoundedRows((from, to) => supabase
      .from("profiles")
      .select("id,clerk_id,email,full_name,username,bio,profile_pic_url,image_url,one_link_username,one_link_display_name,one_link_avatar_url,one_link_settings,one_link_updated_at,updated_at")
      .order("id", { ascending: true })
      .range(from, to), { expectedCount: profileCountResult.count });
    const oneLinks = collectPublishedOneLinks(profiles);
    return res.status(200).json({ success: true, oneLinks, total: oneLinks.length, updatedAt: new Date().toISOString() });
  } catch (error) {
    const code = error instanceof AdminOverviewFailure ? error.code : "ADMIN_OVERVIEW_DATABASE_ERROR";
    return res.status(503).json({ success: false, code, error: "Published One Links are temporarily unavailable." });
  }
}

export async function handleListUsers(req, res, dependencies = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      error: "GET is required for this endpoint.",
    });
  }
  if (!/^Bearer\s+\S+$/i.test(textValue(req.headers?.authorization))) {
    return res.status(401).json({
      success: false,
      code: "ADMIN_AUTH_REQUIRED",
      error: "Sign-in is required.",
    });
  }
  const requestHeader = textValue(req.headers?.["x-request-id"]);
  const requestId = /^[A-Za-z0-9_-]{8,80}$/.test(requestHeader)
    ? requestHeader
    : randomUUID();
  try {
    const authenticate =
      dependencies.authenticate || requireVerifiedClerkUser;
    const actor = await authenticate(req, res);
    if (!actor) return;
    const supabase = dependencies.supabase || getAdminUsersClient();
    const authorize =
      dependencies.authorize || authorizeAdminUsersActor;
    if (!(await authorize(actor, res, supabase))) return;

    const [clerkUsers, profiles] = await Promise.all([
      (dependencies.fetchClerkUsers || fetchAllClerkUsers)(),
      (dependencies.fetchProfiles || fetchAllProfiles)(supabase),
    ]);
    if (!Array.isArray(clerkUsers) || !Array.isArray(profiles)) {
      throw new AdminUsersFailure("ADMIN_USERS_RESPONSE_INVALID", 502);
    }
    const normalizedUsers = normalizeAdminUsers(clerkUsers, profiles);

    return res.status(200).json({
      success: true,
      users: normalizedUsers,
      admins: normalizedUsers.filter((user) => user.role === "admin"),
    });
  } catch (error) {
    const failure =
      error instanceof AdminUsersFailure
        ? error
        : new AdminUsersFailure("ADMIN_USERS_LOOKUP_FAILED", 503);
    console.error("[admin-users] request failed", {
      code: failure.code,
      status: failure.status,
      routeAction: "list-users",
      providerStatus: failure.providerStatus,
      requestId,
    });
    if (failure.retryAfter !== null) {
      res.setHeader("Retry-After", String(failure.retryAfter));
    }
    const safeMessages = {
      ADMIN_USERS_CONFIGURATION_ERROR:
        "The admin user service is not configured.",
      ADMIN_USERS_PROVIDER_UNAUTHORIZED:
        "The admin user provider could not be authorized.",
      ADMIN_USERS_RATE_LIMITED:
        "User synchronization is temporarily rate limited.",
      ADMIN_USERS_RESPONSE_INVALID:
        "The admin user service returned an invalid response.",
      ADMIN_USERS_LOOKUP_FAILED:
        "Users could not be refreshed right now.",
    };
    return res.status(failure.status).json({
      success: false,
      code: failure.code,
      error:
        safeMessages[failure.code] ||
        safeMessages.ADMIN_USERS_LOOKUP_FAILED,
      requestId,
    });
  }
}

async function handleReconcileWalletFunding(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const reference = textValue(body?.reference);
    if (!/^wallet_fund_[A-Za-z0-9_-]{6,180}$/.test(reference)) {
      return res.status(400).json({ success: false, error: "INVALID_FUNDING_REFERENCE" });
    }

    const result = await reconcileWalletFunding({ supabase, reference });
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("[admin-funding-reconcile] reconciliation failed:", error?.message || error);
    return res.status(503).json({ success: false, error: "FUNDING_RECONCILIATION_FAILED" });
  }
}

async function handleListPortfolioPurchases(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: portfolio_purchases, error } = await supabase
      .from("portfolio_purchases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(ADMIN_DASHBOARD_PAGE_SIZE);

    if (error) throw error;
    return res.status(200).json({ success: true, portfolio_purchases });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_PORTFOLIO_PURCHASES_FAILED" });
  }
}

async function handleListOrders(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(ADMIN_DASHBOARD_PAGE_SIZE);

    if (error) throw error;
    return res.status(200).json({ success: true, orders });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_ORDERS_FAILED" });
  }
}

async function handleListAdmins(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;
    const [clerkUsers, profiles] = await Promise.all([
      fetchAllClerkUsers(),
      fetchAllProfiles(supabase),
    ]);
    const admins = normalizeAdminUsers(clerkUsers, profiles)
      .filter((user) => user.role === "admin");

    return res.status(200).json({ 
      success: true, 
      admins 
    });

  } catch {
    console.error("[list-admins] request failed");
    return res.status(500).json({ 
      success: false, 
      error: "LIST_ADMINS_FAILED"
    });
  }
}

async function handleFinancialDashboard(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    // Aggregates run in PostgreSQL. The dashboard only receives a bounded
    // recent ledger and balance page, rather than every financial row.
    const [summaryResult, profilesResult, transactionsResult] = await Promise.all([
      supabase.rpc("admin_financial_summary_v1"),
      supabase
        .from("profiles")
        .select("id, email, full_name, balance, clerk_id, created_at")
        .order("created_at", { ascending: false })
        .limit(ADMIN_DASHBOARD_PAGE_SIZE),
      supabase
        .from("wallet_transactions")
        .select("id,user_id,user_email,reference,type,amount,status,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(ADMIN_DASHBOARD_PAGE_SIZE),
    ]);

    if (summaryResult.error || profilesResult.error || transactionsResult.error) throw new Error("FINANCIAL_DASHBOARD_QUERY_FAILED");
    const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
    if (!summary) throw new Error("FINANCIAL_DASHBOARD_SUMMARY_UNAVAILABLE");

    return res.status(200).json({
      success: true,
      totalLiquidity: Number(summary.total_liquidity || 0),
      pendingFundingEstimate: Number(summary.pending_withdrawal_total || 0),
      pendingWithdrawalCount: Number(summary.pending_withdrawal_count || 0),
      users: profilesResult.data || [],
      transactions: transactionsResult.data || [],
      pageSize: ADMIN_DASHBOARD_PAGE_SIZE,
    });

  } catch {
    console.error("[financial-dashboard] request failed");
    return res.status(500).json({ success: false, error: "FINANCIAL_DASHBOARD_FAILED" });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];

  if (action === "financial-dashboard") return await handleFinancialDashboard(req, res)
  if (action === "list-orders") return await handleListOrders(req, res)
  if (action === "list-subscriptions") return await handleListSubscriptions(req, res)
  if (action === "list-profiles") return await handleListProfiles(req, res)
  if (action === "overview-metrics") return await handleOverviewMetrics(req, res)
  if (action === "list-published-onelinks") return await handleListPublishedOneLinks(req, res)
  if (action === "list-users") return await handleListUsers(req, res)
  if (action === "list-portfolio_purchases") return await handleListPortfolioPurchases(req, res)
  if (action === "portfolio-share") return await handlePortfolioShare(req, res)
  if (action === "send-login-email" || action === "send-logins-email") return await handleSendLoginEmail(req, res)
  if (action === "broadcast-email") return await handleBroadcastEmail(req, res)
  if (action === "list-admins") return await handleListAdmins(req, res)
  if (action === "reconcile-wallet-funding") return await handleReconcileWalletFunding(req, res)
  if (action === "add") return await handleAdd(req, res)
  if (action === "update") return await handleUpdate(req, res)
  if (action === "delete") return await handleDelete(req, res)

  return res.status(404).json({ error: "Unknown action" })
}
