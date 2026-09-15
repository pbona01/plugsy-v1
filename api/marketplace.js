import { createClient } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { buildMarketplaceEmail } from "./_marketplaceEmail.js";
import { dojahOutcome, fetchDojahVerification } from './_marketplaceVerification.js';
import { validateMarketplaceFile, createUploadUrl, verifyUploadedFile, createDownloadUrl } from './_marketplaceStorage.js';
import { requireVerifiedClerkUser, requireVerifiedClerkAdmin } from "./_clerkAuth.js";

const text = (value) => String(value || "").trim();
const slugify = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
const isUrl = (value) => {
  try { const url = new URL(text(value)); return url.protocol === 'https:' && !url.username && !url.password && text(value).length <= 2048; }
  catch { return false; }
};
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const listingFields = "id,seller_id,title,slug,summary,description,category,price,currency,cover_image_url,delivery_label,visibility,status,resale_policy,resale_commission_percent,published_at,created_at,updated_at";
const ownerListingFields = `${listingFields},delivery_url,private_access_token,terms_version,delivery_asset_id`;

const getClient = () => {
  const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error("MARKETPLACE_CONFIG_REQUIRED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "public" } });
};

const readBody = (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body !== "string") return {};
  try { return JSON.parse(req.body); } catch { return {}; }
};

const send = (res, status, code, error, extra = {}) =>
  res.status(status).json({ success: false, code, error, ...extra });

export const trustScoreForSeller = (seller) => {
  const completed = Number(seller?.completed_orders_count || 0);
  const upheld = Number(seller?.upheld_disputes_count || 0);
  return completed + upheld > 0 ? Math.round(100 * completed / (completed + upheld)) : null;
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
  publishedAt: listing.published_at || null,
  seller: seller ? {
    trustScore: trustScoreForSeller(seller),
    verified: seller.verification_status === "verified",
    completedOrders: Number(seller.completed_orders_count || 0),
  } : { trustScore: null, verified: false, completedOrders: 0 },
});

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

async function loadSellers(supabase, sellerIds) {
  const ids = [...new Set(sellerIds.map(text).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("marketplace_seller_profiles")
    .select("user_id,trust_score,verification_status,public_selling_enabled,public_plan_expires_at,completed_orders_count,upheld_disputes_count")
    .in("user_id", ids);
  if (error) throw error;
  return new Map((data || []).map((seller) => [seller.user_id, seller]));
}

async function browse(req, res) {
  const supabase = getClient();
  const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || "localhost"}`);
  const category = text(req.query?.category || url.searchParams.get("category")).toLowerCase();
  const queryText = text(req.query?.q || url.searchParams.get("q"));
  const requestedLimit = Number(req.query?.limit || url.searchParams.get("limit") || 24);
  const limit = Math.max(1, Math.min(48, Number.isFinite(requestedLimit) ? requestedLimit : 24));
  let query = supabase.from("marketplace_listings").select(listingFields)
    .eq("status", "published").eq("visibility", "public").order("published_at", { ascending: false }).limit(limit);
  if (category && /^[a-z0-9_-]{2,48}$/.test(category)) query = query.eq("category", category);
  if (queryText) query = query.ilike('title', `%${queryText.slice(0, 60).replace(/[\\%_]/g, '\\$&')}%`);
  const { data, error } = await query;
  if (error) throw error;
  const sellers = await loadSellers(supabase, (data || []).map((listing) => listing.seller_id));
  return res.status(200).json({ success: true, listings: (data || []).filter(listing => canPublishPublicly(sellers.get(listing.seller_id))).map((listing) => publicListing(listing, sellers.get(listing.seller_id))) });
}

async function privateListing(req, res) {
  const supabase = getClient();
  const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || "localhost"}`);
  const accessToken = text(req.query?.accessToken || url.searchParams.get("accessToken"));
  if (!/^[a-f0-9]{32}$/i.test(accessToken)) return send(res, 404, "PRIVATE_LISTING_NOT_FOUND", "This private product link is unavailable.");
  const { data: listing, error } = await supabase.from("marketplace_listings").select(listingFields)
    .eq("private_access_token", accessToken).eq("visibility", "private").eq("status", "published").maybeSingle();
  if (error) throw error;
  if (!listing) return send(res, 404, "PRIVATE_LISTING_NOT_FOUND", "This private product link is unavailable.");
  const sellers = await loadSellers(supabase, [listing.seller_id]);
  return res.status(200).json({ success: true, listing: { ...publicListing(listing, sellers.get(listing.seller_id)), privateAccessToken: accessToken } });
}

async function productListing(req,res) {
  const url=new URL(req.originalUrl||req.url,`http://${req.headers?.host||'localhost'}`);
  const id=text(req.query?.id||url.searchParams.get('id'));
  if(!/^[0-9a-f-]{36}$/i.test(id)) return send(res,404,'PRODUCT_NOT_FOUND','This product is unavailable.');
  const supabase=getClient();
  const {data,error}=await supabase.from('marketplace_listings').select(listingFields).eq('id',id).eq('visibility','public').eq('status','published').maybeSingle(); if(error) throw error;
  if(!data) return send(res,404,'PRODUCT_NOT_FOUND','This product is unavailable.');
  const sellers=await loadSellers(supabase,[data.seller_id]);
  if(!canPublishPublicly(sellers.get(data.seller_id))) return send(res,404,'PRODUCT_NOT_FOUND','This product is unavailable.');
  return res.status(200).json({success:true,listing:publicListing(data,sellers.get(data.seller_id))});
}

async function sellerWorkspace(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const supabase = getClient();
  const [{ data: listings, error: listingError }, { data: seller, error: sellerError }, { data: sales, error: salesError }] = await Promise.all([
    supabase.from("marketplace_listings").select(ownerListingFields).eq("seller_id", actor.userId).order("updated_at", { ascending: false }),
    supabase.from("marketplace_seller_profiles").select("verification_status,public_selling_enabled,public_plan_expires_at,trust_score,total_sales_count,completed_orders_count,upheld_disputes_count").eq("user_id", actor.userId).maybeSingle(),
    supabase.from("marketplace_orders").select("id,order_reference,listing_id,amount,funds_status,hold_expires_at,created_at").eq("seller_id", actor.userId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (listingError || sellerError || salesError) throw listingError || sellerError || salesError;
  return res.status(200).json({ success: true, seller: { ...(seller || { verification_status: "unverified", public_selling_enabled: false, total_sales_count: 0, completed_orders_count: 0, upheld_disputes_count: 0 }), trust_score: trustScoreForSeller(seller) }, listings: listings || [], sales: sales || [] });
}

async function createListing(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const body = readBody(req);
  const parsed = allowedListingPayload(body);
  if (parsed.error) return send(res, 400, "LISTING_INVALID", parsed.error);
  const supabase = getClient();
  const baseSlug = slugify(parsed.payload.title) || "plugsy-product";
  const slug = `${baseSlug}-${randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase.from("marketplace_listings").insert({ seller_id: actor.userId, slug, ...parsed.payload, status: "draft" }).select(ownerListingFields).single();
  if (error) throw error;
  await supabase.from("marketplace_seller_profiles").upsert({ user_id: actor.userId }, { onConflict: "user_id", ignoreDuplicates: true });
  return res.status(201).json({ success: true, listing: data });
}

async function updateListing(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const body = readBody(req);
  const listingId = text(body.listingId);
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return send(res, 400, "LISTING_ID_INVALID", "Choose a valid listing.");
  const parsed = allowedListingPayload(body);
  if (parsed.error) return send(res, 400, "LISTING_INVALID", parsed.error);
  const supabase = getClient();
  const { data, error } = await supabase.from("marketplace_listings")
    .update({ ...parsed.payload, status: "draft", updated_at: new Date().toISOString() })
    .eq("id", listingId).eq("seller_id", actor.userId).select(ownerListingFields).maybeSingle();
  if (error) throw error;
  if (!data) return send(res, 404, "LISTING_NOT_FOUND", "That listing was not found.");
  return res.status(200).json({ success: true, listing: data });
}

async function publishListing(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const body = readBody(req);
  const listingId = text(body.listingId);
  const nextStatus = text(body.status || "published");
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || !['published', 'paused', 'archived'].includes(nextStatus)) return send(res, 400, "PUBLISH_REQUEST_INVALID", "Use a valid listing and status.");
  const supabase = getClient();
  const { data: listing, error: listingError } = await supabase.from("marketplace_listings").select("id,visibility,delivery_url,delivery_asset_id").eq("id", listingId).eq("seller_id", actor.userId).maybeSingle();
  if (listingError) throw listingError;
  if (!listing) return send(res, 404, "LISTING_NOT_FOUND", "That listing was not found.");
  if (nextStatus === 'published' && !listing.delivery_url && !listing.delivery_asset_id) return send(res, 400, "DELIVERY_REQUIRED", "Add a secure delivery link or scanned file before publishing.");
  if (nextStatus === 'published' && listing.delivery_asset_id) {
    const {data:asset,error}=await supabase.from('marketplace_assets').select('status').eq('id',listing.delivery_asset_id).eq('seller_id',actor.userId).maybeSingle();
    if(error) throw error;
    if(asset?.status!=='clean') return send(res,409,'FILE_NOT_READY','The product file must pass scanning before publishing.');
  }
  if (nextStatus === 'published' && listing.visibility === 'public') {
    const { data: seller, error } = await supabase.from("marketplace_seller_profiles").select("public_selling_enabled,verification_status,public_plan_expires_at").eq("user_id", actor.userId).maybeSingle();
    if (error) throw error;
    if (!seller?.public_selling_enabled || seller.verification_status !== 'verified' || !seller.public_plan_expires_at || new Date(seller.public_plan_expires_at).getTime() <= Date.now()) return send(res, 403, "PUBLIC_SELLER_PLAN_REQUIRED", "Public marketplace publishing will open after your seller plan and verification are approved.");
  }
  const { data, error } = await supabase.from("marketplace_listings")
    .update({ status: nextStatus, published_at: nextStatus === 'published' ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", listingId).eq("seller_id", actor.userId).select(ownerListingFields).single();
  if (error) throw error;
  return res.status(200).json({ success: true, listing: data });
}

async function purchase(req, res) {
  if (process.env.MARKETPLACE_PAYMENTS_ENABLED !== 'true') return send(res, 403, "MARKETPLACE_PREVIEW", "Marketplace is in preview. Purchases are not enabled yet.");
  const actor = await requireActor(req, res);
  if (!actor) return;
  const body = readBody(req);
  const listingId = text(body.listingId);
  const idempotencyKey = text(req.headers?.["idempotency-key"] || body.idempotencyKey);
  if (body.acceptedTermsVersion !== 'marketplace-v1') return send(res, 400, "BUYER_TERMS_REQUIRED", "Accept the marketplace buyer-protection terms before purchasing.");
  if (!/^[0-9a-f-]{36}$/i.test(listingId) || !idempotencyPattern.test(idempotencyKey)) return send(res, 400, "PURCHASE_REQUEST_INVALID", "The marketplace purchase request is invalid.");
  const supabase = getClient();
  let resellerUserId = null;
  if (body.resellerCode) {
    if (!/^[a-f0-9]{32}$/i.test(text(body.resellerCode))) return send(res, 400, 'RESELLER_CODE_INVALID', 'The reseller code is invalid.');
    const result = await supabase.from('marketplace_resale_requests').select('requester_id').eq('purchase_code', text(body.resellerCode)).eq('listing_id', listingId).eq('status','approved').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data || result.data.requester_id === actor.userId) return send(res, 400, 'RESELLER_CODE_INVALID', 'This reseller code cannot be used for your purchase.');
    resellerUserId = result.data.requester_id;
  }
  const { data, error } = await supabase.rpc("marketplace_create_wallet_order_v1", {
    p_actor_user_id: actor.userId,
    p_actor_email: actor.email,
    p_listing_id: listingId,
    p_idempotency_key: idempotencyKey,
    p_private_access_token: text(body.privateAccessToken) || null,
    p_reseller_user_id: resellerUserId,
  });
  if (error || !data?.success) return send(res, 409, "MARKETPLACE_PURCHASE_FAILED", "This purchase could not be completed. Your wallet was not charged twice.");
  return res.status(200).json({ success: true, purchase: data });
}

async function library(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const supabase = getClient();
  const { data, error } = await supabase.from("marketplace_entitlements")
    .select("id,access_status,granted_at,order:marketplace_orders!inner(id,order_reference,amount,funds_status,hold_expires_at,created_at),listing:marketplace_listings!inner(id,title,slug,summary,category,cover_image_url,delivery_label)")
    .eq("buyer_id", actor.userId).order("granted_at", { ascending: false });
  if (error) throw error;
  return res.status(200).json({ success: true, entitlements: data || [] });
}

async function delivery(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || "localhost"}`);
  const orderId = text(req.query?.orderId || url.searchParams.get("orderId"));
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return send(res, 400, "ORDER_ID_INVALID", "Choose a valid marketplace order.");
  const supabase = getClient();
  const { data, error } = await supabase.from("marketplace_entitlements")
    .select("access_status,order:marketplace_orders!inner(id,buyer_id,payment_status,listing_snapshot)")
    .eq("order_id", orderId).eq("buyer_id", actor.userId).maybeSingle();
  if (error) throw error;
  const order = Array.isArray(data?.order) ? data.order[0] : data?.order;
  if (!data || data.access_status !== 'active' || order?.payment_status !== 'paid') return send(res, 404, "DELIVERY_NOT_AVAILABLE", "Your product delivery is not available.");
  if(order.listing_snapshot?.delivery_asset_id) {
    const {data:asset,error}=await supabase.from('marketplace_assets').select('id,object_key,status,original_name').eq('id',order.listing_snapshot.delivery_asset_id).maybeSingle();
    if(error) throw error;
    if(!asset || asset.status!=='clean') return send(res,409,'FILE_NOT_READY','This product file is temporarily unavailable.');
    return res.status(200).json({success:true,deliveryUrl:await createDownloadUrl(asset),deliveryLabel:order.listing_snapshot.delivery_label});
  }
  if(!order.listing_snapshot?.delivery_url) return send(res,404,'DELIVERY_NOT_AVAILABLE','Your product delivery is not available.');
  return res.status(200).json({ success: true, deliveryUrl: order.listing_snapshot.delivery_url, deliveryLabel: order.listing_snapshot.delivery_label });
}

async function openDispute(req, res) {
  const actor = await requireActor(req, res);
  if (!actor) return;
  const body = readBody(req);
  const orderId = text(body.orderId);
  const reasonCode = text(body.reasonCode);
  const description = text(body.description);
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !['not_as_described', 'unavailable', 'misleading', 'duplicate_charge', 'other'].includes(reasonCode) || description.length < 10 || description.length > 3000) {
    return send(res, 400, "DISPUTE_INVALID", "Give a valid order, issue type and clear description.");
  }
  const supabase = getClient();
  const { data, error } = await supabase.rpc("marketplace_open_dispute_v1", {
    p_actor_user_id: actor.userId, p_order_id: orderId, p_reason_code: reasonCode, p_description: description,
  });
  if (error) return send(res, 409, "DISPUTE_UNAVAILABLE", "A report already exists, or this order is outside the 10-hour protection window.");
  return res.status(201).json({ success: true, dispute: data });
}

async function sellerVerification(req,res,action) {
  const actor = await requireActor(req,res); if (!actor) return;
  if (process.env.MARKETPLACE_DOJAH_ENABLED !== 'true' || !text(process.env.DOJAH_APP_ID) || !text(process.env.DOJAH_SECRET_KEY) || !text(process.env.DOJAH_PUBLIC_KEY) || !text(process.env.DOJAH_WIDGET_ID)) {
    return send(res,503,'DOJAH_CONFIG_REQUIRED','Dojah seller verification is not configured yet.');
  }
  const supabase=getClient();
  const {data:seller,error}=await supabase.from('marketplace_seller_profiles').select('user_id,verification_status,verification_reference,verification_provider').eq('user_id',actor.userId).maybeSingle();
  if(error) throw error;
  if(seller?.verification_status==='verified') return res.status(200).json({success:true,status:'verified'});
  if(action==='start-verification') {
    const reference=seller?.verification_status==='pending' && seller?.verification_provider==='dojah' ? seller.verification_reference : `MP-KYC-${randomUUID()}`;
    const changes={verification_provider:'dojah',verification_reference:reference,verification_status:'pending',updated_at:new Date().toISOString()};
    const saved=seller ? await supabase.from('marketplace_seller_profiles').update(changes).eq('user_id',actor.userId).eq('verification_status',seller.verification_status).select('user_id') : await supabase.from('marketplace_seller_profiles').insert({user_id:actor.userId,...changes}).select('user_id');
    const saveError=saved.error;
    if(saveError) throw saveError;
    if(!saved.data?.length) return send(res,409,'VERIFICATION_CHANGED','Verification changed. Refresh before trying again.');
    return res.status(200).json({success:true,status:'pending',widget:{appId:process.env.DOJAH_APP_ID,publicKey:process.env.DOJAH_PUBLIC_KEY,widgetId:process.env.DOJAH_WIDGET_ID,reference}});
  }
  if(!seller?.verification_reference || seller.verification_provider!=='dojah') return send(res,409,'VERIFICATION_NOT_STARTED','Start seller verification first.');
  const result=await fetchDojahVerification(seller.verification_reference);
  const status=dojahOutcome(result,seller.verification_reference);
  // Ignore browser callbacks and bind the provider result to the stored session.
  const {data:updated,error:updateError}=await supabase.from('marketplace_seller_profiles').update({verification_status:status,updated_at:new Date().toISOString()}).eq('user_id',actor.userId).eq('verification_reference',seller.verification_reference).eq('verification_status','pending').select('verification_status');
  if(updateError) throw updateError;
  if(!updated?.length) return send(res,409,'VERIFICATION_CHANGED','Verification was updated. Refresh your seller workspace.');
  return res.status(200).json({success:true,status});
}

async function activatePremium(req, res) {
  if (process.env.MARKETPLACE_PAYMENTS_ENABLED !== 'true') return send(res,403,'MARKETPLACE_PREVIEW','Paid plans are disabled during the marketplace preview.');
  const actor = await requireActor(req,res); if (!actor) return;
  const body = readBody(req);
  if (!idempotencyPattern.test(text(body.idempotencyKey)) || body.acceptedTermsVersion !== 'marketplace-premium-v1') return send(res,400,'PREMIUM_INPUT_INVALID','Accept the seller plan terms before activation.');
  const {data,error} = await getClient().rpc('marketplace_activate_premium_v1', {
    p_actor_user_id: actor.userId, p_actor_email: actor.email || '', p_idempotency_key: text(body.idempotencyKey),
  });
  if (error) return send(res,409,'PREMIUM_ACTIVATION_UNAVAILABLE','Activation requires a verified seller, an inactive plan and at least ₦1,500 in your Wallet.');
  return res.status(200).json({success:true,plan:data});
}

async function releaseDue(req, res) {
  if (process.env.MARKETPLACE_PAYMENTS_ENABLED !== 'true') return send(res, 403, "MARKETPLACE_PREVIEW", "Marketplace purchases are not enabled yet.");
  const expectedSecret = text(process.env.CRON_SECRET);
  const receivedSecret = text(req.headers?.authorization).replace(/^Bearer\s+/i, "");
  if (!secretsMatch(expectedSecret, receivedSecret)) return send(res, 401, "CRON_UNAUTHORIZED", "Not authorized.");
  const supabase = getClient();
  const { data, error } = await supabase.rpc("marketplace_release_due_orders_v1", { p_limit: 250 });
  if (error) throw error;
  return res.status(200).json({ success: true, released: Number(data || 0) });
}

const secretsMatch = (expected, received) => Boolean(expected) && Buffer.byteLength(expected) === Buffer.byteLength(received) && timingSafeEqual(Buffer.from(expected), Buffer.from(received));

async function processEmails(req,res) {
  const secret=text(req.headers?.authorization).replace(/^Bearer\s+/i,'');
  if(!secretsMatch(text(process.env.CRON_SECRET),secret)) return send(res,401,'CRON_UNAUTHORIZED','Not authorized.');
  if(process.env.MARKETPLACE_PAYMENTS_ENABLED!=='true' || !text(process.env.RESEND_API_KEY)) return send(res,403,'EMAIL_WORKER_DISABLED','Marketplace email delivery is not enabled.');
  const supabase=getClient(); const resend=new Resend(process.env.RESEND_API_KEY);
  const {data:jobs,error}=await supabase.rpc('marketplace_claim_emails_v1',{p_limit:10}); if(error) throw error;
  let sent=0; let failed=0;
  for(const job of jobs||[]) {
    let messageId=null; let failure=null;
    try { const result=await resend.emails.send(buildMarketplaceEmail(job),{idempotencyKey:`marketplace-email:${job.id}`}); if(result.error) throw new Error(result.error.name || 'RESEND_SEND_FAILED'); messageId=result.data?.id; if(!messageId) throw new Error('RESEND_MESSAGE_ID_MISSING'); }
    catch(err) { failure=err?.message || 'EMAIL_SEND_FAILED'; }
    const result=await supabase.rpc('marketplace_finish_email_v1',{p_id:job.id,p_lease:job.lease_token,p_message_id:messageId,p_error:failure});
    if(result.error) throw result.error;
    if(messageId&&result.data) sent++; else failed++;
  }
  return res.status(200).json({success:true,sent,failed});
}

async function adminWorkspace(req, res) {
  const supabase = getClient();
  const actor = await requireVerifiedClerkAdmin(req, res, supabase);
  if (!actor) return;
  const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const days = Math.min(365, Math.max(1, Number.parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const results = await Promise.all([
    supabase.from('marketplace_disputes').select('id,order_id,buyer_id,seller_id,reason_code,description,status,resolution_note,created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('marketplace_seller_profiles').select('user_id,verification_status,verification_provider,verification_reference,public_selling_enabled,public_plan_expires_at,total_sales_count,completed_orders_count,upheld_disputes_count').order('updated_at', { ascending: false }).limit(100),
    supabase.from('marketplace_audit_events').select('id,actor_id,action,entity_id,details,created_at').order('created_at', { ascending: false }).limit(50),
    supabase.from('marketplace_orders').select('id,order_reference,buyer_id,seller_id,listing_id,amount,platform_fee,seller_amount,reseller_amount,payment_status,funds_status,created_at,listing:marketplace_listings(title,category)').gte('created_at', since).order('created_at', { ascending: true }).limit(5000),
    supabase.from('marketplace_listings').select('id,title,category,status,visibility,price,seller_id,created_at').order('created_at', { ascending: false }).limit(1000),
    supabase.from('marketplace_assets').select('id,status,expected_size,actual_size,created_at').limit(2000),
  ]);
  if (results.some((result) => result.error)) throw results.find((result) => result.error).error;
  const orders = results[3].data || [];
  const paid = orders.filter((order) => order.payment_status === 'paid');
  const uniqueBuyers = new Set(paid.map((order) => order.buyer_id)).size;
  return res.status(200).json({ success: true, days, generatedAt: new Date().toISOString(), disputes: results[0].data, sellers: results[1].data, events: results[2].data, orders, listings: results[4].data || [], assets: results[5].data || [], summary: {
    grossVolume: paid.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    platformRevenue: paid.reduce((sum, order) => sum + Number(order.platform_fee || 0), 0),
    orders: paid.length,
    uniqueBuyers,
    heldValue: orders.filter((order) => order.funds_status === 'held').reduce((sum, order) => sum + Number(order.seller_amount || 0), 0),
    refundedValue: orders.filter((order) => order.payment_status === 'refunded').reduce((sum, order) => sum + Number(order.amount || 0), 0),
  }});
}

async function resaleWorkspace(req, res) {
  const actor = await requireActor(req,res); if (!actor) return;
  const supabase=getClient();
  const fields='id,listing_id,requester_id,seller_id,requested_commission_percent,status,purchase_code,seller_note,listing:marketplace_listings(id,title,visibility,private_access_token)';
  const [outgoing,incoming]=await Promise.all([
    supabase.from('marketplace_resale_requests').select(fields).eq('requester_id',actor.userId).order('created_at',{ascending:false}).limit(100),
    supabase.from('marketplace_resale_requests').select(fields).eq('seller_id',actor.userId).order('created_at',{ascending:false}).limit(100),
  ]);
  if(outgoing.error || incoming.error) throw outgoing.error || incoming.error;
  return res.status(200).json({success:true,outgoing:outgoing.data,incoming:incoming.data});
}

async function resaleMutation(req,res,action) {
  const actor=await requireActor(req,res); if(!actor) return;
  const supabase=getClient(); const body=readBody(req); let result;
  if(action==='request-resale') {
    if(!/^[0-9a-f-]{36}$/i.test(text(body.listingId)) || !Number.isFinite(Number(body.percent)) || Number(body.percent)<1 || Number(body.percent)>80) return send(res,400,'RESALE_REQUEST_INVALID','Choose a product and commission between 1% and 80%.');
    result=await supabase.rpc('marketplace_request_resale_v1',{p_actor_id:actor.userId,p_listing_id:body.listingId,p_percent:Number(body.percent),p_private_token:text(body.privateAccessToken)||null});
  } else {
    if(!/^[0-9a-f-]{36}$/i.test(text(body.requestId)) || !['approved','rejected','revoked'].includes(body.status) || text(body.note).length>1000) return send(res,400,'RESALE_DECISION_INVALID','Choose a valid resale request and decision.');
    result=await supabase.rpc('marketplace_decide_resale_v1',{p_actor_id:actor.userId,p_request_id:body.requestId,p_status:body.status,p_note:text(body.note)});
  }
  if(result.error) return send(res,409,'RESALE_UNAVAILABLE','This resale action is unavailable or the request has already changed.');
  return res.status(200).json({success:true,result:result.data});
}

async function fileMutation(req,res,action) {
  const actor=await requireActor(req,res); if(!actor) return;
  const supabase=getClient(); const body=readBody(req);
  if(action==='prepare-upload') {
    let filename; try{filename=validateMarketplaceFile({name:body.name,contentType:body.contentType,size:Number(body.size)});}catch(error){return send(res,400,'FILE_INVALID',error.message);}
    const listingId=text(body.listingId);
    if(!/^[0-9a-f-]{36}$/i.test(listingId)) return send(res,400,'LISTING_ID_INVALID','Choose a listing.');
    const {data:listing,error}=await supabase.from('marketplace_listings').select('id').eq('id',listingId).eq('seller_id',actor.userId).maybeSingle(); if(error) throw error;
    if(!listing) return send(res,404,'LISTING_NOT_FOUND','Listing not found.');
    const asset={id:randomUUID(),seller_id:actor.userId,listing_id:listingId,object_key:`marketplace/${actor.userId}/${randomUUID()}/${filename}`,original_name:filename,content_type:body.contentType,expected_size:Number(body.size)};
    const uploadUrl=await createUploadUrl(asset);
    const result=await supabase.rpc('marketplace_reserve_asset_v1',{p_asset_id:asset.id,p_actor_id:actor.userId,p_listing_id:listingId,p_object_key:asset.object_key,p_name:filename,p_type:asset.content_type,p_size:asset.expected_size});
    if(result.error) return send(res,409,'UPLOAD_QUOTA','Upload limit reached or listing access changed. Current limit: 1 GB and 20 pending uploads per seller.');
    return res.status(201).json({success:true,assetId:asset.id,uploadUrl});
  }
  if(!/^[0-9a-f-]{36}$/i.test(text(body.assetId))) return send(res,400,'ASSET_INVALID','Choose a valid upload.');
  const {data:asset,error}=await supabase.from('marketplace_assets').select('*').eq('id',body.assetId).eq('seller_id',actor.userId).maybeSingle(); if(error) throw error;
  if(!asset||!['uploading','quarantined'].includes(asset.status)) return send(res,409,'UPLOAD_UNAVAILABLE','This upload is not awaiting confirmation.');
  let actualSize; try{actualSize=await verifyUploadedFile(asset);}catch{ return send(res,409,'UPLOAD_MISMATCH','Upload is missing or does not match the expected file.'); }
  const result=await supabase.rpc('marketplace_complete_asset_v1',{p_actor_id:actor.userId,p_asset_id:asset.id,p_size:actualSize}); if(result.error) throw result.error;
  return res.status(200).json({success:true,status:'quarantined',message:'Uploaded. Awaiting malware scanning; buyers cannot download this file yet.'});
}

async function adminMutation(req, res, action) {
  const supabase = getClient();
  const actor = await requireVerifiedClerkAdmin(req, res, supabase);
  if (!actor) return;
  const body = readBody(req);
  let result;
  if (action === 'resolve-dispute') {
    if (!/^[0-9a-f-]{36}$/i.test(text(body.disputeId)) || !['buyer','seller'].includes(body.outcome) || text(body.note).length < 10 || text(body.note).length > 3000) return send(res, 400, 'RESOLUTION_INVALID', 'Choose an outcome and explain the decision.');
    result = await supabase.rpc('marketplace_resolve_dispute_v1', { p_admin_id: actor.userId, p_dispute_id: body.disputeId, p_outcome: body.outcome, p_note: text(body.note) });
  } else {
    const expires = body.planExpiresAt ? new Date(body.planExpiresAt) : null;
    if (!/^user_[A-Za-z0-9]+$/.test(text(body.sellerId)) || typeof body.verified !== 'boolean' || (body.verified && text(body.reference).length < 10) || (expires && (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()))) return send(res, 400, 'SELLER_REVIEW_INVALID', 'Provide a seller, genuine review reference and valid access expiry.');
    result = await supabase.rpc('marketplace_approve_seller_v1', { p_admin_id: actor.userId, p_seller_id: text(body.sellerId), p_verified: body.verified, p_reference: text(body.reference), p_plan_expires_at: expires?.toISOString() || null });
  }
  if (result.error) return send(res, 409, 'ADMIN_ACTION_FAILED', 'The action was not completed. Check the review details and order status.');
  return res.status(200).json({ success: true, result: result.data });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  if (req.method === "OPTIONS") return res.status(200).end();
  const url = new URL(req.originalUrl || req.url, `http://${req.headers?.host || "localhost"}`);
  const action = text(req.query?.action || url.searchParams.get("action") || "browse");
  try {
    if (req.method === "GET" && action === "browse") return await browse(req, res);
    if (req.method === "GET" && action === "product") return await productListing(req,res);
    if (req.method === "GET" && action === "admin-workspace") return await adminWorkspace(req, res);
    if (req.method === "GET" && action === "resale-workspace") return await resaleWorkspace(req,res);
    if (req.method === "POST" && ['request-resale','decide-resale'].includes(action)) return await resaleMutation(req,res,action);
    if (req.method === "POST" && ['prepare-upload','complete-upload'].includes(action)) return await fileMutation(req,res,action);
    if (req.method === "POST" && ['resolve-dispute','review-seller'].includes(action)) return await adminMutation(req, res, action);
    if (req.method === "GET" && action === "private-listing") return await privateListing(req, res);
    if (req.method === "GET" && action === "workspace") return await sellerWorkspace(req, res);
    if (req.method === "GET" && action === "library") return await library(req, res);
    if (req.method === "GET" && action === "delivery") return await delivery(req, res);
    if (req.method === "POST" && action === "create-listing") return await createListing(req, res);
    if (req.method === "PATCH" && action === "update-listing") return await updateListing(req, res);
    if (req.method === "POST" && action === "publish") return await publishListing(req, res);
    if (req.method === "POST" && action === "purchase") return await purchase(req, res);
    if (req.method === 'POST' && action === 'activate-premium') return await activatePremium(req,res);
    if (req.method === 'POST' && ['start-verification','check-verification'].includes(action)) return await sellerVerification(req,res,action);
    if (req.method === "POST" && action === "open-dispute") return await openDispute(req, res);
    if (req.method === "POST" && action === "release-due") return await releaseDue(req, res);
    if (req.method === "POST" && action === "process-emails") return await processEmails(req,res);
    return send(res, 404, "MARKETPLACE_ACTION_NOT_FOUND", "That marketplace action does not exist.");
  } catch (error) {
    console.error("[marketplace] request failed", { action, message: error?.message || error });
    return send(res, 503, "MARKETPLACE_UNAVAILABLE", "Marketplace is temporarily unavailable. Please try again.");
  }
}
