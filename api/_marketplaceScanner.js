import { readMarketplaceFile, readMarketplaceFileHead } from './_marketplaceStorage.js';

// Documents are capped before private malware scanning so a Vercel function
// never buffers a large upload. Media uses a small ranged signature check.
const MAX_AUTOMATIC_SCAN_BYTES = 24 * 1024 * 1024;
const AUTOMATIC_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']);
const VT_BASE_URL = 'https://www.virustotal.com/api/v3';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const privateApiKey = () => String(process.env.VIRUSTOTAL_API_KEY || '').trim();
const scanStats = (attributes = {}) => attributes.stats || attributes.last_analysis_stats || {};
const hasFinalStats = (attributes = {}) => {
  const stats = scanStats(attributes);
  return ['malicious', 'suspicious', 'undetected', 'harmless'].some((key) => Object.prototype.hasOwnProperty.call(stats, key));
};
const dangerous = (attributes = {}) => {
  const stats = scanStats(attributes);
  return Number(stats.malicious || 0) + Number(stats.suspicious || 0) > 0;
};

export function matchesMarketplaceMediaSignature(contentType, input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const ascii = (start, end) => bytes.subarray(start, end).toString('ascii');
  if (contentType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/webp') return bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (contentType === 'video/webm') return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (contentType === 'video/mp4' || contentType === 'video/quicktime') return bytes.length >= 12 && ascii(4, 8) === 'ftyp';
  return false;
}

export function supportsAutomaticMediaReview(contentType) {
  return AUTOMATIC_MEDIA_TYPES.has(contentType);
}

async function virusTotalRequest(path, options = {}) {
  const response = await fetch(`${VT_BASE_URL}${path}`, {
    ...options,
    headers: { 'x-apikey': privateApiKey(), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`VIRUSTOTAL_${response.status}`);
  return payload;
}

async function waitForPrivateAnalysis(analysisId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const payload = await virusTotalRequest(`/analyses/${encodeURIComponent(analysisId)}`);
    const attributes = payload?.data?.attributes || {};
    if (attributes.status === 'completed') return { analysisId, attributes };
    await wait(1500);
  }
  return { analysisId, attributes: null };
}

export async function scanMarketplaceAsset(asset) {
  if (supportsAutomaticMediaReview(asset.content_type)) {
    const head = await readMarketplaceFileHead(asset, 32);
    if (!matchesMarketplaceMediaSignature(asset.content_type, head)) return { state: 'rejected', provider: 'media_signature', analysisId: asset.id };
    return { state: 'clean', provider: 'media_signature', analysisId: asset.id };
  }
  if (!privateApiKey()) return { state: 'manual', reason: 'scanner_not_configured' };
  if (Number(asset.actual_size || asset.expected_size || 0) > MAX_AUTOMATIC_SCAN_BYTES) return { state: 'manual', reason: 'file_too_large' };

  const bytes = await readMarketplaceFile(asset, MAX_AUTOMATIC_SCAN_BYTES);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: asset.content_type }), asset.original_name);
  const submitted = await virusTotalRequest('/private/files', { method: 'POST', body: form });
  const analysisId = String(submitted?.data?.id || '');
  if (!analysisId) throw new Error('VIRUSTOTAL_ANALYSIS_MISSING');
  const completed = await waitForPrivateAnalysis(analysisId);
  if (!completed.attributes) return { state: 'pending', analysisId };
  if (!hasFinalStats(completed.attributes)) return { state: 'manual', reason: 'scan_result_incomplete', analysisId };
  return dangerous(completed.attributes)
    ? { state: 'rejected', analysisId }
    : { state: 'clean', analysisId };
}

export async function checkMarketplaceAssetScan(scanReference) {
  if (!privateApiKey()) return { state: 'manual', reason: 'scanner_not_configured' };
  if (!String(scanReference || '').startsWith('virustotal_private:')) return { state: 'manual', reason: 'scan_reference_invalid' };
  const analysisId = String(scanReference).slice('virustotal_private:'.length);
  if (!analysisId) return { state: 'manual' };
  const payload = await virusTotalRequest(`/analyses/${encodeURIComponent(analysisId)}`);
  const attributes = payload?.data?.attributes || {};
  if (attributes.status !== 'completed') return { state: 'pending', analysisId };
  if (!hasFinalStats(attributes)) return { state: 'manual', reason: 'scan_result_incomplete', analysisId };
  return dangerous(attributes) ? { state: 'rejected', analysisId } : { state: 'clean', analysisId };
}
