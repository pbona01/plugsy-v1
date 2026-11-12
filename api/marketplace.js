Warning: truncated output (original token count: 35651)
Total output lines: 1976

import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { buildMarketplaceEmail, buildMarketplaceGuestEmail, buildMarketplaceProductUpdateEmail } from "./_marketplaceEmail.js";
import { fetchPremblySession, findPremblySession, hasPremblyWidgetConfiguration, premblyClientConfiguration, premblySessionId, premblySessionReference, premblyWidgetOutcome } from './_marketplaceVerification.js';
import { validateMarketplaceFile, createUploadUrl, verifyUploadedFile, createDownloadUrl } from './_marketplaceStorage.js';
import { scanMarketplaceAsset, checkMarketplaceAssetScan, supportsAutomaticMediaReview } from './_marketplaceScanner.js';
import { requireVerifiedClerkUser, requireVerifiedClerkAdmin } from "./_clerkAuth.js";
import { verifyFlutterwaveReference } from "./_walletFundingWebhook.js";
import { rejectDisallowedOrigin } from "./_httpSecurity.js";
import { getSavedPurchaseCode, savePurchaseCode } from './_savedPurchaseCode.js';
import { computeMarketplaceTrustScore } from "../shared/marketplaceTrust.js";
import { encryptMarketplaceAdToken, sendMarketplacePurchaseEvents } from "./_marketplaceAds.js";
import {
  MarketplaceReferralError,
  ensureOpenReferralAgreement,
  normalizeMarketplaceReferralCode,
  resolveMarketplaceReferral,
} from './_marketplaceReferral.js';

const text = (value) => String(value || "").trim();
const slugify = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
const isUrl = (value) => {
  try { const url = new URL(text(value)); return url.protocol === 'https:' && !url.username && !url.password && text(value).length <= 2048; }
  catch { return false; }
};
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value)) && text(value).length <= 254;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
// Launch mode is deliberately frictionless: a completed, validated upload is
// ready to sell immediately. Set this variable to "false" only if Plugsy
// deliberately returns to manual/third-party file review in future.
const automaticallyApproveUploads = () => text(process.env.MARKETPLACE_AUTO_APPROVE_UPLOADS).toLowerCase() !== 'false';
const marketplaceRulesVersion = "marketplace-rules-v1";
const verificationConsentVersion = "seller-identity-v2-2026-10-02";
const listingFields = "id,seller_id,title,slug,summary,description,category,price,currency,cover_image_url,delivery_label,visibility,status,resale_policy,resale_commission_percent,published_at,created_at,updated_at";
const ownerListingFields = `${listingFields},delivery_url,private_access_token,terms_version,delivery_asset_id`;

const getClient = () => {
  const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error("MARKETPLACE_CONFIG_REQUIRED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "public" } });
};

async function loadListingDeliveries(supabase, listingId) {
  const { data, error } = await supabase.from('marketplace_listing_deliveries')
    .select('id,kind,asset_id,delivery_url,label,description,sort_order,created_at,updated_at')
    .eq('listing_id', listingId).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error && error.code !== '42P01') throw error;
  return data || [];
}

async function queueProductUpdateNotifications(supabase, listingId, title) {
  const [{ data: orders, error: orderError }, { data: guestOrders, error: guestError }] = await Promise.all([
    supabase.from('marketplace_orders').select('buyer_id').eq('listing_id', listingId).eq('payment_status', 'paid'),
    supabase.from('marketplace_guest_orders').select('buyer_email').eq('listing_id', listingId).eq('payment_status', 'paid'),
  ]);
  if (orderError || guestError) throw orderError || guestError;
  const buyerIds = [...new Set((orders || []).map((row) => text(row.buyer_id)).filter(Boolean))];
  let profiles = [];
  if (buyerIds.length) {
    const result = await supabase.from('profiles').select('clerk_id,email').in('clerk_id', buyerIds);
    if (result.error) throw result.error;
    profiles = result.data || [];
  }
  const rows = [
    ...profiles.filter((profile) => isEmail(profile.email)).map((profile) => ({ listing_id: listingId, buyer_id: profile.clerk_id, title, message: `The seller updated ${title}. You can download the latest version from your Plugsy library.` })),
    ...(guestOrders || []).filter((row) => isEmail(row.buyer_email)).map((row) => ({ listing_id: listingId, buyer_email: row.buyer_email, title, message: `The seller updated ${title}. Open your original Plugsy delivery email to download the latest version.` })),
  ];
  if (!rows.length) return 0;
  const { error } = await supabase.from('marketplace_product_update_notifications').insert(rows);
  if (error && error.code !== '42P01') throw error;
  return rows.length;
}

const readBody = (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body !== "string") return {};
  try { return JSON.parse(req.body); } catch { return {}; }
};

const send = (res, status, code, error, extra = {}) =>
  res.status(status).json({ success: false, code, error, ...extra });

const purchaseFailure = (error) => {
  const message = text(error?.message || error).toUpperCase();
  const known = {
    INSUFFICIENT_FUNDS: [402, "INSUFFICIENT_WALLET_FUNDS", "Your Plugsy Wallet balance is too low for this purchase. Fund your wallet and try again."],
    LISTING_NOT_AVAILABLE: [409, "PRODUCT_UNAVAILABLE", "This product is no longer available. Refresh the page and choose another product."],
    SELF_PURCHASE_NOT_ALLOWED: [400, "SELF_PURCHASE_NOT_ALLOWED", "You cannot buy your own product."],
    SELLER_VERIFICATION_REQUIRED: [409, "SELLER_NOT_READY", "This seller is not yet approved to receive marketplace purchases."],
    SELLER_PLAN_EXPIRED: [409, "SELLER_PLAN_EXPIRED", "This seller's public marketplace access has expired."],
    PRIVATE_LISTING_ACCESS_DENIED: [403, "PRIVATE_PRODUCT_ACCESS_DENIED", "This private product link is not valid."],
    FILE_NOT_READY: [409, "PRODUCT_FILE_UNAVAILABLE", "The seller's product file is still under security review. Please try again later."],
    DELIVERY_REQUIRED: [409, "PRODUCT_DELIVERY_UNAVAILABLE", "This product is missing its delivery setup. Please contact the seller."],
    PROFILE_NOT_FOUND: [409, "WALLET_PROFILE_UNAVAILABLE", "Your wallet is still being set up. Refresh once, then try again."],
    IDEMPOTENCY_KEY_REUSED: [409, "PURCHASE_RETRY_CONFLICT", "This purchase is already being processed. Please check My library before trying again."],
  };
  for (const [match, value] of Object.entries(known)) if (message.includes(match)) return value;
  return [409, "MARKETPLACE_PURCHASE_FAILED", "This purchase could not be completed. Your wallet was not charged twice."];
};

export const trustScoreForSeller = (seller) => {
  return computeMarketplaceTrustScore({
    completedOrders: seller?.completed_orders_count,
    upheldDisputes: seller?.upheld_disputes_count,
  });
};

export const canPublishPublicly = (seller, now = Date.now()) => seller?.verification_status === 'verified' && seller?.public_selling_enabled === true && Date.parse(seller?.public_plan_expires_at || '') > now;

export const publicListing = (listing, seller) => ({
  id: listing.id,
  sellerId: listing.seller_id,
  title: listing.title,
  slug: listing.slug,
  summary: listing.summary,
  description: listing.description,
  category: listing.category,
  price: Number(listing.price || 0),
  currency: listing.currency || "NGN",
  coverImageUrl: listing.cover_image_url || null,
  deliveryLabel: listing.delivery_label || "Open product",
  resalePolicy: listing.resale_policy,
  resaleCommissionPercent: listing.resale_commission_percent === null ? null : Number(listing.resale_commission_percent),
  fee: seller ? (() => {
    const premium = seller.public_selling_enabled === true && Date.parse(seller.public_plan_expires_at || "") > Date.now();
    const percent = premium ? 3 : 6;
    const paidBy = seller.marketplace_fee_paid_by === "seller" ? "seller" : "buyer";
    const amount = Math.round(Number(listing.price || 0) * percent) / 100;
    return { percent, paidBy, amount, total: Number(listing.price || 0) + (paidBy === "buyer" ? amount : 0) };
  })() : null,
  publishedAt: listing.published_at || null,
  seller: seller ? {
    trustScore: trustScoreForSeller(seller),
    verified: seller.verification_status === "verified",
    completedOrders: Number(seller.completed_orders_count || 0),
    id: seller.user_id,
    name: seller.display_name || "Plugsy creator",
    username: seller.username || null,
    avatar: seller.avatar_url || null,
    adPixels: seller.ad_pixels || null,
  } : { trustScore: null, verified: false, completedOrders: 0 },
});

const publicContactMethods = (row) => ({
  plugsyInbox: row?.plugsy_inbox_enabled !== false,
  whatsappUrl: text(row?.whatsapp_url) || null,
  telegramUrl: text(row?.telegram_url) || null,
});

async function loadSellerContactPreferences(supabase, sellerId) {
  const { data, error } = await supabase.from('marketplace_seller_contact_preferences')
    .select('plugsy_inbox_enabled,whatsapp_url,telegram_url,updated_at')
    .eq('seller_id', sellerId).maybeSingle();
  // The marketplace remains available until this additive migration has run.
  if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error;
  return publicContactMethods(data);
}

async function loadRelatedProducts(supabase, listing, seller) {
  const { data: links, error } = await supabase.from('marketplace_listing_related_products')
    .select('related_listing_id,sort_order').eq('listing_id', listing.id)
    .order('sort_order', { ascending: true }).limit(2);
  if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error;
  const ids = (links || []).map((row) => row.related_listing_id).filter(Boolean);
  if (!ids.length) return [];
  const { data: listings, error: listingError } = await supabase.from('marketplace_listings').select(listingFields)
    .in('id', ids).eq('seller_id', listing.seller_id).eq('visibility', 'public').eq('status', 'published');
  if (listingError) throw listingError;
  const byId = new Map((listings || []).map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map((item) => publicListing(item, seller));
}

export const allowedListingPayload = (body) => {
  const title = text(body.title);
  const summary = text(body.summary);
  const description = text(body.description);
  const category = text(body.category).toLowerCase();
  const price = Number(body.price);
  const coverImageUrl = text(body.coverImageUrl);
  const deliveryUrl = text(body.deliveryUrl);
  const deliveryLabel = text(body.deliveryLabel) || "Open product";
  const visibility = text(body.visibility || "private");
  const resalePolicy = text(body.resalePolicy || "not_allowed");
  const resaleCommissionPercent = body.resaleCommissionPercent === "" || body.resaleCommissionPercent === null || body.resaleCommissionPercent === undefined
    ? null
    : Number(body.resaleCommissionPercent);
  if (title.length < 3 || title.length > 100) return { error: "Use a listing title between 3 and 100 characters." };
  if (summary.length > 220 || description.length > 8000) return { error: "Your listing text is too long." };
  if (description.length < 20) return { error: "Add a product description of at least 20 characters so buyers know exactly what they will receive." };
  if (!/^[a-z0-9_-]{2,48}$/.test(category)) return { error: "Choose a valid category." };
  if (!Number.isFinite(price) || price < 100 || price > 10_000_000) return { error: "Set a price between ₦100 and ₦10,000,000." };
  if (coverImageUrl && !isUrl(coverImageUrl)) return { error: "Cover image must be a secure URL." };
  if (deliveryUrl && !isUrl(deliveryUrl)) return { error: "Delivery link must be a secure URL." };
  if (deliveryLabel.length < 2 || deliveryLabel.length > 80) return { error: "Delivery label must be between 2 and 80 characters." };
  if (!['private', 'public'].includes(visibility)) return { error: "Choose private or public visibility." };
  if (!['not_allowed', 'fixed_percent', 'approval_required'].includes(resalePolicy)) return { error: "Choose a valid resale policy." };
  if (resalePolicy === 'fixed_percent' && (!Number.isFinite(resaleCommissionPercent) || resaleCommissionPercent < 1 || resaleCommissionPercent > 80)) {
    return { error: "Fixed resale commission must be between 1% and 80%." };
  }
  return {
    payload: {
      title, summary, description, category, price, cover_image_url: coverImageUrl || null,
      delivery_url: deliveryUrl || null, delivery_label: deliveryLabel, visibility, resale_policy: resalePolicy,
      resale_commission_percent: resalePolicy === 'fixed_percent' ? resaleCommissionPercent : null,
    },
  };
};

async function requireActor(req, res) {
  return requireVerifiedClerkUser(req, res);
}

async function hasAcceptedMarketplaceRules(supabase, userId) {
  const { data, error } = await supabase
    .from("marketplace_user_rule_acceptances")
    .select("rules_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.rules_version === marketplaceRulesVersion;
}

async function marketplaceOnboarding(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const supabase = getClient();
  const { data, error } = await supabase
    .from("marketplace_user_rule_acceptances")
    .select("rules_version,accepted_at")
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (error) {
    // Rules acknowledgement must never make the live marketplace unusable.
    // During a schema-cache refresh or partial migration, keep the customer in
    // the marketplace and let a later visit retry the acknowledgement lookup.
    console.error("[marketplace-onboarding] lookup unavailable", error.code || error.message);
    return res.status(200).json({ success: true, accepted: true, acceptedAt: null, rulesVersion: marketplaceRulesVersion, persistencePending: true });
  }
  return res.status(200).json({ success: true, accepted: data?.rules_version === marketplaceRulesVersion, acceptedAt: data?.accepted_at || null, rulesVersion: marketplaceRulesVersion });
}

async function acceptMarketplaceOnboarding(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const body = readBody(req);
  if (body.rulesAccepted !== true) return send(res, 400, "MARKETPLACE_RULES_REQUIRED", "Read and acknowledge the Marketplace rules to continue.");
  const supabase = getClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("marketplace_user_rule_acceptances").upsert({
    user_id: actor.userId,
    rules_version: marketplaceRulesVersion,
    accepted_at: now,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (error) {
    console.error("[marketplace-onboarding] save unavailable", error.code || error.message);
    return res.status(200).json({ success: true, accepted: true, rulesVersion: marketplaceRulesVersion, persistencePending: true });
  }
  return res.status(200).json({ success: true, accepted: true, rulesVersion: marketplaceRulesVersion, persistencePending: false });
}

async function loadSellers(supabase, sellerIds) {
  const ids = [...new Set(sellerIds.map(text).filter(Boolean))];
  if (!ids.length) return new Map();
  const [sellerResult, profileResult, adResult] = await Promise.all([
    supabase
      .from("marketplace_seller_profiles")
      .select("user_id,trust_score,verification_status,public_selling_enabled,public_plan_expires_at,marketplace_fee_paid_by,completed_orders_count,upheld_disputes_count")
      .in("user_id", ids),
    supabase
      .from("profile_directory_v1")
      .select("clerk_id,username,full_name,profile_pic_url,image_url")
      .in("clerk_id", ids),
    supabase.from("marketplace_ad_integrations").select("seller_id,meta_pixel_id,tiktok_pixel_id").in("seller_id", ids),
  ]);
  // Ad integrations decorate cards but are not required to browse or buy.
  // Never let a missing/stale optional ad table blank the live marketplace.
  const adsUnavailable = Boolean(adResult.error);
  if (adsUnavailable) console.error("[marketplace-browse] optional ad pixels unavailable", adResult.error.code || adResult.error.message);
  if (sellerResult.error || profileResult.error) throw sellerResult.error || profileResult.error;
  const profiles = new Map((profileResult.data || []).map((profile) => [profile.clerk_id, profile]));
  const adPixels = new Map((adsUnavailable ? [] : adResult.data || []).map((row) => [row.seller_id, { metaPixelId: row.meta_pixel_id || null, tiktokPixelId: row.tiktok_pixel_id || null }]));
  return new Map((sellerResult.data || []).map((seller) => {
    const profile = profiles.get(seller.user_id);
    return [seller.user_id, {
      ...seller,
      display_name: profile?.full_name || profile?.username || "Plugsy creator",
      username: profile?.username || null,
      avatar_url: profile?.profile_pic_url || profile?.image_url || null,
      ad_pixels: adPixels.get(seller.user_id) || null,
    }];
  }));
}

async function followedSellers(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const supabase = getClient();
  const { data, error } = await supabase
    .from('marketplace_seller_follows')
    .select('seller_id')
    .eq('follower_id', actor.userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return res.status(200).json({ success: true, sellerIds: (data || []).map((row) => row.seller_id) });
}

async function setSellerFollow(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const body = readBody(req);
  const sellerId = text(body.sellerId);
  const follow = body.follow === true;
  if (!/^user_[A-Za-z0-9]+$/.test(sellerId)) return send(res, 400, 'SELLER_ID_INVALID', 'Choose a valid seller.');
  if (sellerId === actor.userId) return send(res, 400, 'SELF_FOLLOW_NOT_ALLOWED', 'You cannot follow your own store.');
  const supabase = getClient();
  const { data: seller, error: sellerError } = await supabase
    .from('marketplace_seller_profiles')
    .select('user_id')
    .eq('user_id', sellerId)
    .maybeSingle();
  if (sellerError) throw sellerError;
  if (!seller) return send(res, 404, 'SELLER_NOT_FOUND', 'This seller is no longer available.');
  if (follow) {
    const { error } = await supabase.from('marketplace_seller_follows')
      .upsert({ follower_id: actor.userId, seller_id: sellerId }, { onConflict: 'follower_id,seller_id', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('marketplace_seller_follows')
      .delete().eq('follower_id', actor.userId).eq('seller_id', sellerId);
    if (error) throw error;
  }
  return res.status(200).json({ success: true, following: follow, sellerId });
}

async function creatorProfile(req, res) {
  const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || "localhost"}`);
  const sellerId = text(req.query?.sellerId || url.searchParams.get("sellerId"));
  if (!/^user_[A-Za-z0-9]+$/.test(sellerId)) return send(res, 404, "CREATOR_NOT_FOUND", "This creator is unavailable.");
  const supabase = g…25651 tokens truncated…rue, message:'Security scan is still running. We will keep checking automatically.' }); }
    if (scan.state === 'pending') return res.status(200).json({ success:true, status:'quarantined', automatic:true, message:'Security scan is still running. We will keep checking automatically.' });
    if (scan.state === 'manual') {
      await supabase.from('marketplace_assets').update({ scan_reference:`manual_review:${scan.reason || 'scanner_check'}` }).eq('id',asset.id).eq('status','quarantined');
      return res.status(200).json({ success:true, status:'quarantined', automatic:false, message:'This file needs an admin security review.' });
    }
    const { error: updateError } = await supabase.from('marketplace_assets').update({ status:scan.state, scan_reference:`virustotal_private:${scan.analysisId}`, scanned_at:new Date().toISOString() }).eq('id',asset.id).eq('status','quarantined');
    if (updateError) throw updateError;
    if (scan.state === 'clean') return res.status(200).json({ success:true, status:'clean', automatic:true, message:'Uploaded and approved by the Marketplace security scan. You can publish this product now.' });
    return res.status(200).json({ success:true, status:'rejected', automatic:true, message:'This file did not pass the security scan and cannot be sold.' });
  }
  if(!asset||!['uploading','quarantined'].includes(asset.status)) return send(res,409,'UPLOAD_UNAVAILABLE','This upload is not awaiting confirmation.');
  let actualSize; try{actualSize=await verifyUploadedFile(asset);}catch{ return send(res,409,'UPLOAD_MISMATCH','Upload is missing or does not match the expected file.'); }
  const result=await supabase.rpc('marketplace_complete_asset_v1',{p_actor_id:actor.userId,p_asset_id:asset.id,p_size:actualSize}); if(result.error) throw result.error;
  const deliveryTitle = text(body.deliveryTitle || body.deliveryLabel) || asset.original_name;
  const deliveryDescription = text(body.deliveryDescription);
  if (deliveryTitle.length > 120 || deliveryDescription.length > 2000) return send(res, 400, 'DELIVERY_METADATA_INVALID', 'Use a lesson title under 120 characters and description under 2,000 characters.');
  const { error: deliveryInsertError } = await supabase.from('marketplace_listing_deliveries').upsert({ listing_id: asset.listing_id, seller_id: actor.userId, kind: 'file', asset_id: asset.id, label: deliveryTitle, description: deliveryDescription, sort_order: Number.isFinite(Number(body.sortOrder)) ? Math.max(0, Number(body.sortOrder)) : 0 }, { onConflict: 'id' });
  if (deliveryInsertError && deliveryInsertError.code !== '42P01') throw deliveryInsertError;
  if (automaticallyApproveUploads()) {
    const { error: approvalError } = await supabase.from('marketplace_assets').update({ status:'clean', scan_reference:'automatic_acceptance:validated_upload', scanned_at:new Date().toISOString() }).eq('id', asset.id).eq('status', 'quarantined');
    if (approvalError) throw approvalError;
    try {
      const { data: listingInfo } = await supabase.from('marketplace_listings').select('title').eq('id', asset.listing_id).maybeSingle();
      await queueProductUpdateNotifications(supabase, asset.listing_id, listingInfo?.title || 'Your purchased product');
      await flushProductUpdateEmails(supabase);
    } catch (notificationError) { console.error('[marketplace] automatic approval update notifications pending', notificationError?.message || notificationError); }
    return res.status(200).json({ success:true, status:'clean', automatic:true, message:'Uploaded and approved automatically. You can publish this product now.' });
  }
  let scan = { state: 'manual', reason: 'scanner_unavailable' };
  try { scan = await scanMarketplaceAsset({ ...asset, actual_size: actualSize }); } catch (scanError) { const code=text(scanError?.message); console.error('[marketplace] private file scan pending manual review', code || scanError); scan={ state:'manual', reason:code==='VIRUSTOTAL_401'||code==='VIRUSTOTAL_403'?'scanner_access_denied':'scanner_unavailable' }; }
  if (scan.state === 'clean' || scan.state === 'rejected') {
    const scanReference = scan.provider === 'media_signature' ? `media_signature:${scan.analysisId}` : scan.provider === 'cloudmersive' ? `cloudmersive:${scan.analysisId}` : `virustotal_private:${scan.analysisId}`;
    const { error: scanUpdateError } = await supabase.from('marketplace_assets').update({ status: scan.state, scan_reference: scanReference, scanned_at: new Date().toISOString() }).eq('id', asset.id).eq('status', 'quarantined');
    if (scanUpdateError) throw scanUpdateError;
    if (scan.state === 'rejected') return send(res, 422, 'FILE_REJECTED', 'This file did not pass the security scan and cannot be sold.');
    try {
      const { data: listingInfo } = await supabase.from('marketplace_listings').select('title').eq('id', asset.listing_id).maybeSingle();
      await queueProductUpdateNotifications(supabase, asset.listing_id, listingInfo?.title || 'Your purchased product');
      await flushProductUpdateEmails(supabase);
    } catch (notificationError) { console.error('[marketplace] file update notifications pending', notificationError?.message || notificationError); }
    return res.status(200).json({success:true,status:'clean',automatic:true,message:'Uploaded and approved by the Marketplace security scan. You can publish this product now.'});
  }
  if (scan.state === 'pending') {
    await supabase.from('marketplace_assets').update({ scan_reference: `virustotal_private:${scan.analysisId}` }).eq('id', asset.id).eq('status', 'quarantined');
    return res.status(200).json({success:true,status:'quarantined',automatic:true,message:'Uploaded securely. The automatic security scan is still running; Plugsy will keep checking it automatically.'});
  }
  const manualMessage = scan.reason === 'file_too_large' ? 'Uploaded securely. This file is too large for automatic scanning and is awaiting Marketplace security review.' : scan.reason === 'scanner_access_denied' ? 'Uploaded securely, but the automatic scanner could not access your VirusTotal private-scanning plan. This file is awaiting Marketplace security review.' : scan.reason === 'scan_result_incomplete' ? 'Uploaded securely. The scanner returned an incomplete result, so this file is awaiting Marketplace security review.' : 'Uploaded securely. It is awaiting a Marketplace security review before buyers can download it.';
  return res.status(200).json({success:true,status:'quarantined',automatic:false,message:manualMessage});
}

async function addDeliveryLink(req, res) {
  const actor = await requireActor(req, res); if (!actor) return;
  const body = readBody(req); const listingId = text(body.listingId); const url = text(body.url); const label = text(body.label) || 'Open link';
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || !isUrl(url) || label.length > 120) return send(res, 400, 'DELIVERY_LINK_INVALID', 'Add a valid secure link and a short button name.');
  const supabase = getClient();
  const { data: listing, error: listingError } = await supabase.from('marketplace_listings').select('id,title').eq('id', listingId).eq('seller_id', actor.userId).maybeSingle();
  if (listingError) throw listingError;
  if (!listing) return send(res, 404, 'LISTING_NOT_FOUND', 'That listing was not found.');
  const description = text(body.description);
  if (description.length > 2000) return send(res, 400, 'DELIVERY_LINK_INVALID', 'Keep the lesson description under 2,000 characters.');
  const { data, error } = await supabase.from('marketplace_listing_deliveries').insert({ listing_id: listingId, seller_id: actor.userId, kind: 'link', delivery_url: url, label, description, sort_order: Number.isFinite(Number(body.sortOrder)) ? Math.max(0, Number(body.sortOrder)) : 0 }).select('id,kind,delivery_url,label,description,sort_order').single();
  if (error) throw error;
  try { await queueProductUpdateNotifications(supabase, listingId, listing.title); await flushProductUpdateEmails(supabase); } catch (notificationError) { console.error('[marketplace] delivery link update notifications pending', notificationError?.message || notificationError); }
  return res.status(201).json({ success: true, delivery: data });
}

async function updateDeliveries(req, res) {
  const actor = await requireActor(req, res); if (!actor) return;
  const body = readBody(req);
  const listingId = text(body.listingId);
  const items = Array.isArray(body.items) ? body.items : [];
  const removedIds = Array.isArray(body.removedIds) ? body.removedIds.map(text) : [];
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || items.length > 100 || removedIds.length > 100) return send(res, 400, 'DELIVERY_UPDATE_INVALID', 'Choose a valid product and up to 100 course items.');
  const normalized = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const id = text(item.id);
    const kind = text(item.kind);
    const label = text(item.label);
    const description = text(item.description);
    const deliveryUrl = text(item.deliveryUrl);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['file', 'link'].includes(kind) || label.length < 1 || label.length > 120 || description.length > 2000 || (kind === 'link' && !isUrl(deliveryUrl))) return send(res, 400, 'DELIVERY_UPDATE_INVALID', 'Every course item needs a short title, an optional description under 2,000 characters, and a valid link when applicable.');
    normalized.push({ id, kind, label, description, deliveryUrl, sortOrder: index });
  }
  if (removedIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return send(res, 400, 'DELIVERY_UPDATE_INVALID', 'A course item could not be removed safely.');
  const supabase = getClient();
  const { data: listing, error: listingError } = await supabase.from('marketplace_listings').select('id,title').eq('id', listingId).eq('seller_id', actor.userId).maybeSingle();
  if (listingError) throw listingError;
  if (!listing) return send(res, 404, 'LISTING_NOT_FOUND', 'That listing was not found.');
  for (const item of normalized) {
    const changes = { label: item.label, description: item.description, sort_order: item.sortOrder, updated_at: new Date().toISOString() };
    if (item.kind === 'link') changes.delivery_url = item.deliveryUrl;
    const { data, error } = await supabase.from('marketplace_listing_deliveries').update(changes).eq('id', item.id).eq('listing_id', listingId).eq('seller_id', actor.userId).eq('kind', item.kind).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return send(res, 409, 'DELIVERY_CHANGED', 'A course item changed. Refresh and try again.');
  }
  if (removedIds.length) {
    const { error } = await supabase.from('marketplace_listing_deliveries').delete().in('id', removedIds).eq('listing_id', listingId).eq('seller_id', actor.userId);
    if (error) throw error;
  }
  if (normalized.length || removedIds.length) {
    try { await queueProductUpdateNotifications(supabase, listingId, listing.title); await flushProductUpdateEmails(supabase); } catch (notificationError) { console.error('[marketplace] course update notifications pending', notificationError?.message || notificationError); }
  }
  return res.status(200).json({ success: true });
}

async function adminMutation(req, res, action) {
  const supabase = getClient();
  const actor = await requireVerifiedClerkAdmin(req, res, supabase);
  if (!actor) return;
  const body = readBody(req);
  let result;
  if (action === 'review-asset') {
    const assetId = text(body.assetId);
    const outcome = text(body.outcome);
    if (!/^[0-9a-f-]{36}$/i.test(assetId) || !['clean', 'rejected'].includes(outcome)) return send(res, 400, 'ASSET_REVIEW_INVALID', 'Choose a valid uploaded file and decision.');
    const { data, error } = await supabase.from('marketplace_assets').update({ status: outcome, scan_reference: `manual_review:${actor.userId}`, scanned_at: new Date().toISOString() }).eq('id', assetId).eq('status', 'quarantined').select('id,status').maybeSingle();
    if (error) throw error;
    if (!data) return send(res, 409, 'ASSET_REVIEW_UNAVAILABLE', 'This file is no longer awaiting review.');
    await supabase.from('marketplace_audit_events').insert({ actor_id: actor.userId, action: `asset_${outcome}`, entity_id: assetId, details: { review: 'manual' } });
    return res.status(200).json({ success: true, result: data });
  }
  if (action === 'resolve-dispute') {
    if (!/^[0-9a-f-]{36}$/i.test(text(body.disputeId)) || !['buyer','seller'].includes(body.outcome) || text(body.note).length < 10 || text(body.note).length > 3000) return send(res, 400, 'RESOLUTION_INVALID', 'Choose an outcome and explain the decision.');
    result = await supabase.rpc('marketplace_resolve_dispute_v1', { p_admin_id: actor.userId, p_dispute_id: body.disputeId, p_outcome: body.outcome, p_note: text(body.note) });
  } else {
    if (!/^user_[A-Za-z0-9]+$/.test(text(body.sellerId)) || typeof body.verified !== 'boolean' || (body.verified && text(body.reference).length < 10)) return send(res, 400, 'SELLER_REVIEW_INVALID', 'Provide a seller and genuine review reference.');
    // Identity review is deliberately isolated from paid Premium entitlements.
    result = await supabase.rpc('marketplace_approve_seller_v1', { p_admin_id: actor.userId, p_seller_id: text(body.sellerId), p_verified: body.verified, p_reference: text(body.reference), p_plan_expires_at: null });
  }
  if (result.error) return send(res, 409, 'ADMIN_ACTION_FAILED', 'The action was not completed. Check the review details and order status.');
  return res.status(200).json({ success: true, result: result.data });
}

export default async function handler(req, res) {
  if (rejectDisallowedOrigin(req, res, {
    methods: "GET, POST, PUT, PATCH, OPTIONS",
    headers: "Content-Type, Authorization, Idempotency-Key",
  })) return;
  if (req.method === "OPTIONS") return res.status(200).end();
  const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || "localhost"}`);
  const action = text(req.query?.action || url.searchParams.get("action") || "browse");
  try {
    if (req.method === "GET" && action === "browse") return await browse(req, res);
    if (req.method === "GET" && action === "product") return await productListing(req,res);
    if (req.method === "GET" && action === "creator") return await creatorProfile(req, res);
    if (req.method === "GET" && action === "following") return await followingFeed(req, res);
    if ((req.method === "GET" || req.method === "POST") && action === "comments") return await listingComments(req, res);
    if (req.method === "GET" && action === "reviews") return await productReviews(req, res);
    if (req.method === "POST" && action === "submit-review") return await submitProductReview(req, res);
    if (req.method === "POST" && action === "submit-guest-review") return await submitProductReview(req, res, true);
    if (req.method === "GET" && action === "admin-workspace") return await adminWorkspace(req, res);
    if (req.method === "GET" && action === "admin-dispute-details") return await adminDisputeDetails(req, res);
    if (req.method === "GET" && action === "resale-workspace") return await resaleWorkspace(req,res);
    if (req.method === "POST" && ['validate-referral','referral-link'].includes(action)) return await marketplaceReferral(req,res,action);
    if (req.method === "POST" && ['request-resale','decide-resale'].includes(action)) return await resaleMutation(req,res,action);
    if (req.method === "POST" && ['prepare-upload','complete-upload','check-upload-review'].includes(action)) return await fileMutation(req,res,action);
    if (req.method === "POST" && action === 'add-delivery-link') return await addDeliveryLink(req, res);
    if (req.method === "PATCH" && action === 'update-deliveries') return await updateDeliveries(req, res);
    if (req.method === "POST" && ['resolve-dispute','review-seller','review-asset'].includes(action)) return await adminMutation(req, res, action);
    if (req.method === "GET" && action === "private-listing") return await privateListing(req, res);
    if (req.method === "GET" && action === "onboarding") return await marketplaceOnboarding(req, res);
    if (req.method === "POST" && action === "accept-onboarding") return await acceptMarketplaceOnboarding(req, res);
    if (req.method === "GET" && action === "workspace") return await sellerWorkspace(req, res);
    if (req.method === "GET" && action === "ad-integrations") return await sellerAdIntegrations(req, res, "GET");
    if (req.method === "PUT" && action === "ad-integrations") return await sellerAdIntegrations(req, res, "PUT");
    if (req.method === "GET" && action === "followed-sellers") return await followedSellers(req, res);
    if (req.method === "GET" && action === "library") return await library(req, res);
    if (req.method === "GET" && action === "delivery") return await delivery(req, res);
    if (req.method === "GET" && action === "guest-delivery") return await guestDelivery(req, res);
    if (req.method === "POST" && action === "guest-checkout") return await guestCheckout(req, res);
    if ((req.method === "GET" || req.method === "POST") && action === "verify-guest-checkout") return await verifyGuestCheckout(req, res);
    if (req.method === "POST" && action === "create-listing") return await createListing(req, res);
    if (req.method === "POST" && action === "update-fee-policy") return await updateSellerFeePolicy(req, res);
    if (req.method === "POST" && action === "seller-contact-preferences") return await updateSellerContactPreferences(req, res);
    if (req.method === "POST" && action === "set-related-products") return await setRelatedProducts(req, res);
    if (req.method === "PATCH" && action === "update-listing") return await updateListing(req, res);
    if (req.method === "POST" && action === "publish") return await publishListing(req, res);
    if (req.method === "POST" && action === "purchase") return await purchase(req, res);
    if (req.method === "POST" && action === "follow-seller") return await setSellerFollow(req, res);
    if (req.method === 'POST' && action === 'activate-premium') return await activatePremium(req,res);
    if (req.method === 'POST' && action === 'start-premium-trial') return await startPremiumTrial(req,res);
    if (req.method === 'POST' && action === 'set-premium-auto-renew') return await setPremiumAutoRenew(req,res);
    if (req.method === 'POST' && action === 'activate-storage') return await activateStorage(req,res);
    if (req.method === 'POST' && action === 'begin-identity-verification') return await beginSellerVerification(req, res);
    if (req.method === 'POST' && action === 'complete-identity-verification') return await completeSellerVerification(req, res);
    if (req.method === 'POST' && action === 'check-identity-verification') return await checkSellerVerification(req, res);
    if (req.method === 'POST' && action === 'cancel-identity-verification') return await cancelSellerVerification(req, res);
    if (req.method === "POST" && action === "open-dispute") return await openDispute(req, res);
    if (["GET", "POST"].includes(req.method) && action === "release-due") return await releaseDue(req, res);
    if (["GET", "POST"].includes(req.method) && action === "process-premium-renewals") return await processPremiumRenewals(req, res);
    if (["GET", "POST"].includes(req.method) && action === "process-emails") return await processEmails(req,res);
    return send(res, 404, "MARKETPLACE_ACTION_NOT_FOUND", "That marketplace action does not exist.");
  } catch (error) {
    console.error("[marketplace] request failed", { action, message: error?.message || error });
    return send(res, 503, "MARKETPLACE_UNAVAILABLE", "Marketplace is temporarily unavailable. Please try again.");
  }
}

