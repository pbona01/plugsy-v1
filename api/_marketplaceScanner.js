import { readMarketplaceFile } from './_marketplaceStorage.js';

// Keeping this conservative prevents a Vercel function from buffering a very
// large seller upload. Larger files remain safely quarantined for admin review.
const MAX_AUTOMATIC_SCAN_BYTES = 24 * 1024 * 1024;
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
