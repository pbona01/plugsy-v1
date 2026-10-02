const text = (value) => String(value || '').trim();

export const normalizePurchaseCode = (value) => text(value).toUpperCase();

export class PurchaseCodeProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PurchaseCodeProfileError';
    this.code = code;
  }
}

export async function lookupPurchaseCodeOwner(supabase, value) {
  const code = normalizePurchaseCode(value);
  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) return null;
  const { data, error } = await supabase.from('profiles')
    .select('clerk_id,full_name,purchase_code')
    .eq('purchase_code', code)
    .maybeSingle();
  if (error) throw error;
  return data ? {
    code,
    ownerId: text(data.clerk_id),
    ownerName: text(data.full_name) || 'Plugsy creator',
  } : null;
}

export async function getSavedPurchaseCode(supabase, userId) {
  const { data, error } = await supabase.from('profiles')
    .select('saved_purchase_code')
    .eq('clerk_id', userId)
    .maybeSingle();
  if (error) throw error;
  const savedCode = normalizePurchaseCode(data?.saved_purchase_code);
  if (savedCode) return savedCode;

  const latestCode = await findLatestPurchaseCode(supabase, userId);
  if (!latestCode) return '';
  try {
    const owner = await savePurchaseCode(supabase, userId, latestCode);
    return owner.code;
  } catch (historyError) {
    if (historyError instanceof PurchaseCodeProfileError) return '';
    throw historyError;
  }
}

export async function findLatestPurchaseCode(supabase, userId) {
  const loadLatest = async (table) => {
    const { data, error } = await supabase.from(table)
      .select('purchase_code_used,created_at')
      .eq('user_id', userId)
      .not('purchase_code_used', 'is', null)
      .not('purchase_code_owner_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const code = normalizePurchaseCode(data?.purchase_code_used);
    return code ? { code, usedAt: Date.parse(data?.created_at || '') || 0 } : null;
  };

  const history = (await Promise.all([
    loadLatest('orders'),
    loadLatest('portfolio_purchases'),
  ])).filter(Boolean);
  history.sort((left, right) => right.usedAt - left.usedAt);
  return history[0]?.code || '';
}

export async function savePurchaseCode(supabase, userId, value) {
  const code = normalizePurchaseCode(value);
  const owner = await lookupPurchaseCodeOwner(supabase, code);
  if (!owner) throw new PurchaseCodeProfileError('PURCHASE_CODE_INVALID', 'This purchase code is invalid.');
  if (owner.ownerId === userId) throw new PurchaseCodeProfileError('PURCHASE_CODE_SELF', 'You cannot save your own purchase code.');
  const { data, error } = await supabase.from('profiles')
    .update({ saved_purchase_code: code, saved_purchase_code_updated_at: new Date().toISOString() })
    .eq('clerk_id', userId)
    .select('clerk_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PurchaseCodeProfileError('PROFILE_NOT_FOUND', 'Your Plugsy profile could not be found.');
  return owner;
}

export async function clearSavedPurchaseCode(supabase, userId) {
  const { error } = await supabase.from('profiles')
    .update({ saved_purchase_code: null, saved_purchase_code_updated_at: new Date().toISOString() })
    .eq('clerk_id', userId);
  if (error) throw error;
}

export async function resolvePurchaseCodeForPurchase(supabase, userId, requestedValue) {
  const requestedCode = normalizePurchaseCode(requestedValue);
  const savedCode = requestedCode ? '' : await getSavedPurchaseCode(supabase, userId);
  const code = requestedCode || savedCode;
  if (!code) return { code: null, owner: null, shouldSave: false };
  const owner = await lookupPurchaseCodeOwner(supabase, code);
  if (!owner || owner.ownerId === userId) {
    if (requestedCode) {
      throw new PurchaseCodeProfileError(
        owner?.ownerId === userId ? 'PURCHASE_CODE_SELF' : 'PURCHASE_CODE_INVALID',
        owner?.ownerId === userId ? 'You cannot use your own purchase code.' : 'This purchase code is invalid.',
      );
    }
    await clearSavedPurchaseCode(supabase, userId);
    return { code: null, owner: null, shouldSave: false };
  }
  return { code: owner.code, owner, shouldSave: Boolean(requestedCode && requestedCode !== savedCode) };
}
