import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getPremblyPublicKey, premblySessionId, premblySessionReference, premblyWidgetOutcome } from './_marketplaceVerification.js';

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

const signatureMatches = (rawBody, signature) => {
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
  try {
    const rawBody = await readRawBody(req);
    if (!signatureMatches(rawBody, req.headers?.['x-prembly-signature'])) {
      return res.status(401).json({ success: false, error: 'Invalid Prembly signature.' });
    }
    const payload = JSON.parse(rawBody.toString('utf8'));
    const reference = premblySessionReference(payload);
    const sessionId = premblySessionId(payload);
    if (!/^MP-PREMBLY-[0-9a-f-]{36}$/i.test(reference)) {
      return res.status(202).json({ success: true, ignored: true });
    }
    const status = premblyWidgetOutcome(payload);
    if (status === 'pending') return res.status(202).json({ success: true, status });
    const supabase = getClient();
    const { error } = await supabase.from('marketplace_seller_profiles')
      .update({
        verification_status: status,
        verification_provider: 'prembly_widget',
        verification_reference: sessionId || reference,
        updated_at: new Date().toISOString(),
      })
      .eq('verification_reference', reference)
      .eq('verification_provider', 'prembly_widget')
      .eq('verification_status', 'pending');
    if (error) throw error;
    return res.status(200).json({ success: true, status });
  } catch (error) {
    console.error('[prembly-webhook] failed', error?.message || error);
    return res.status(400).json({ success: false, error: 'Webhook could not be processed.' });
  }
}
