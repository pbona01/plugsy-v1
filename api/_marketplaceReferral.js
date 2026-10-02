const text = (value) => String(value || '').trim();

export const normalizeMarketplaceReferralCode = (value) => text(value).toUpperCase();

export class MarketplaceReferralError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MarketplaceReferralError';
    this.code = code;
  }
}

export async function resolveMarketplaceReferral(supabase, { listingId, buyerUserId = null, code }) {
  const normalized = normalizeMarketplaceReferralCode(code);
  if (!/^[A-Z0-9_-]{3,64}$/.test(normalized)) {
    throw new MarketplaceReferralError('REFERRAL_CODE_INVALID', 'That purchase code is not valid.');
  }

  const { data: listing, error: listingError } = await supabase.from('marketplace_listings')
    .select('id,seller_id,title,visibility,private_access_token,resale_policy,resale_commission_percent,status')
    .eq('id', listingId)
    .maybeSingle();
  if (listingError) throw listingError;
  if (!listing || listing.status !== 'published') {
    throw new MarketplaceReferralError('REFERRAL_PRODUCT_UNAVAILABLE', 'This product is not available for referrals.');
  }
  if (listing.resale_policy === 'not_allowed') {
    throw new MarketplaceReferralError('REFERRALS_DISABLED', 'The seller has not enabled Refer & Earn for this product.');
  }

  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('clerk_id,full_name,username,purchase_code')
    .ilike('purchase_code', normalized)
    .maybeSingle();
  if (profileError) throw profileError;

  let referrerUserId = text(profile?.clerk_id);
  let referrerName = text(profile?.full_name || profile?.username) || 'Plugsy referrer';
  let personalCode = Boolean(profile);
  let agreement = null;

  if (!referrerUserId) {
    const { data, error } = await supabase.from('marketplace_resale_requests')
      .select('requester_id,requested_commission_percent,status,purchase_code')
      .eq('listing_id', listingId)
      .ilike('purchase_code', normalized)
      .eq('status', 'approved')
      .maybeSingle();
    if (error) throw error;
    agreement = data;
    referrerUserId = text(data?.requester_id);
    personalCode = false;
  }

  if (!referrerUserId) throw new MarketplaceReferralError('REFERRAL_CODE_INVALID', 'That purchase code is not valid.');
  if (referrerUserId === listing.seller_id) {
    throw new MarketplaceReferralError('SELLER_REFERRAL_NOT_ALLOWED', 'The seller cannot refer their own product.');
  }
  if (buyerUserId && referrerUserId === buyerUserId) {
    throw new MarketplaceReferralError('SELF_REFERRAL_NOT_ALLOWED', 'You cannot use your own purchase code.');
  }

  if (listing.resale_policy === 'approval_required') {
    if (!agreement) {
      const result = await supabase.from('marketplace_resale_requests')
        .select('requested_commission_percent,status')
        .eq('listing_id', listingId)
        .eq('requester_id', referrerUserId)
        .eq('status', 'approved')
        .maybeSingle();
      if (result.error) throw result.error;
      agreement = result.data;
    }
    if (!agreement) {
      throw new MarketplaceReferralError('REFERRER_NOT_APPROVED', 'This referrer has not been approved for this product yet.');
    }
  }

  const percent = Number(listing.resale_policy === 'fixed_percent'
    ? listing.resale_commission_percent
    : agreement?.requested_commission_percent);
  if (!Number.isFinite(percent) || percent < 1 || percent > 80) {
    throw new MarketplaceReferralError('REFERRAL_TERMS_INVALID', 'The referral terms for this product need to be updated.');
  }

  return {
    code: personalCode ? normalizeMarketplaceReferralCode(profile.purchase_code) : text(code),
    referrerUserId,
    referrerName,
    commissionPercent: percent,
    personalCode,
    listing,
  };
}

export async function ensureOpenReferralAgreement(supabase, referral) {
  if (referral.listing.resale_policy !== 'fixed_percent') return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('marketplace_resale_requests').upsert({
    listing_id: referral.listing.id,
    requester_id: referral.referrerUserId,
    seller_id: referral.listing.seller_id,
    requested_commission_percent: referral.commissionPercent,
    status: 'approved',
    approved_at: now,
    updated_at: now,
  }, { onConflict: 'listing_id,requester_id' });
  if (error) throw error;
}
