import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { fetchPremblySession, getPremblyPublicKey, premblySessionId, premblySessionReference, premblyWidgetOutcome } from './_marketplaceVerification.js';

export const config = { api: { bodyParser: false } };

const text = (value) => String(value || '').trim();

const getClient = () => {
  const url = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error('MARKETPLACE_CONFIG_REQUIRED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'public' } });
};

const readRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export const signatureMatches = (rawBody, signature) => {
  const publicKey = getPremblyPublicKey();
  if (!publicKey || !signature) return false;
  const expected = createHmac('sha256', publicKey).update(rawBody).digest('base64');
  const providedBuffer = Buffer.from(text(signature));
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ success: false });
  let receiptHash = '';
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers?.['x-prembly-signature'];
    const token = text(req.headers?.token);
    if (!token || token.length > 512 || !signatureMatches(rawBody, signature)) {
      return res.status(401).json({ success: false, error: 'Invalid Prembly security headers.' });
    }
    const payload = JSON.parse(rawBody.toString('utf8'));
    const sessionId = premblySessionId(payload);
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) {
      return res.status(400).json({ success: false, error: 'Prembly session is missing.' });
    }
    const authoritative = await fetchPremblySession(sessionId);
    const reference = premblySessionReference(authoritative) || premblySessionReference(payload);
    if (!/^MP-PREMBLY-[0-9a-f-]{36}$/i.test(reference)) {
      return res.status(200).json({ success: true, ignored: true });
    }
    const status = premblyWidgetOutcome(authoritative);
    const supabase = getClient();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    receiptHash = tokenHash;
    const receipt = await supabase.from('marketplace_verification_webhooks')
      .insert({ provider: 'prembly', token_hash: tokenHash, outcome: 'processing' });
    if (receipt.error?.code === '23505') return res.status(200).json({ success: true, duplicate: true });
    if (receipt.error) throw receipt.error;
    const { data: attempt, error: attemptError } = await supabase.from('marketplace_verification_attempts')
      .select('id,user_id,status').eq('reference', reference).maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) {
      await supabase.from('marketplace_verification_webhooks')
        .update({ processed_at: new Date().toISOString(), outcome: 'ignored' })
        .eq('provider', 'prembly').eq('token_hash', tokenHash);
      return res.status(200).json({ success: true, ignored: true });
    }
    const now = new Date().toISOString();
    if (status === 'pending') {
      await supabase.from('marketplace_verification_attempts')
        .update({ provider_session_id: sessionId, last_provider_check_at: now, updated_at: now })
        .eq('id', attempt.id).eq('status', 'pending');
      await supabase.from('marketplace_verification_webhooks')
        .update({ processed_at: now, outcome: 'pending' }).eq('provider', 'prembly').eq('token_hash', tokenHash);
      return res.status(200).json({ success: true, status });
    }
    const { data: updatedAttempts, error: updateAttemptError } = await supabase.from('marketplace_verification_attempts')
      .update({
        status,
        provider_session_id: sessionId,
        completed_at: now,
        failure_code: status === 'rejected' ? 'provider_rejected' : null,
        last_provider_check_at: now,
        updated_at: now,
      })
      .eq('id', attempt.id).eq('status', 'pending').select('id');
    if (updateAttemptError) throw updateAttemptError;
    if (updatedAttempts?.length) {
      const { error: sellerError } = await supabase.from('marketplace_seller_profiles')
        .update({ verification_status: status, verification_provider: 'prembly_widget', verification_reference: sessionId, updated_at: now })
        .eq('user_id', attempt.user_id).eq('verification_reference', reference).eq('verification_status', 'pending');
      if (sellerError) throw sellerError;
    }
    await supabase.from('marketplace_verification_webhooks')
      .update({ processed_at: now, outcome: status }).eq('provider', 'prembly').eq('token_hash', tokenHash);
    return res.status(200).json({ success: true, status });
  } catch (error) {
    if (receiptHash) {
      try {
        await getClient().from('marketplace_verification_webhooks')
          .delete().eq('provider', 'prembly').eq('token_hash', receiptHash).eq('outcome', 'processing');
      } catch {
        // Prembly will retry non-2xx responses; a later operational repair can clear a stuck receipt.
      }
    }
    console.error('[prembly-webhook] failed', error?.message || error);
    return res.status(500).json({ success: false, error: 'Webhook could not be processed.' });
  }
}
