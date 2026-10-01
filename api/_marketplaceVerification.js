const PREMBLY_SESSION_URL = 'https://api.prembly.com/api/v1/checker-widget/sdk/sessions';

const text = (value) => String(value || '').trim();
const isTrue = (value) => value === true || value === 1 || ['true', '1', 'verified', 'success', 'successful', 'passed'].includes(text(value).toLowerCase());
const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const getPremblyApiKey = () => text(
  process.env.PREMBLY_API_KEY || process.env.PREMBLY_SECRET_KEY || process.env.IDENTITYPASS_API_KEY,
);

export const getPremblyPublicKey = () => text(
  process.env.PREMBLY_PUBLIC_KEY || process.env.VITE_PREMBLY_WIDGET_KEY,
);

export const getPremblyOrganisationId = () => text(
  process.env.PREMBLY_ORGANISATION_ID || process.env.PREMBLY_ORGANIZATION_ID,
);

export const getPremblyWidgetId = () => text(
  process.env.PREMBLY_WIDGET_ID || process.env.VITE_PREMBLY_WIDGET_ID,
);

export const hasPremblyWidgetConfiguration = () => Boolean(
  getPremblyApiKey() && getPremblyPublicKey() && getPremblyOrganisationId() && getPremblyWidgetId(),
);

export const premblyClientConfiguration = () => ({
  widgetKey: getPremblyPublicKey(),
  widgetId: getPremblyWidgetId(),
  isTest: /^test[_-]/i.test(getPremblyPublicKey()) || /^test[_-]/i.test(getPremblyApiKey()),
});

export class PremblyVerificationError extends Error {
  constructor(code, { uncertain = false, providerStatus = null } = {}) {
    super(code);
    this.name = 'PremblyVerificationError';
    this.code = code;
    this.uncertain = uncertain;
    this.providerStatus = providerStatus;
  }
}

const nested = (value, paths) => {
  for (const path of paths) {
    let current = value;
    for (const key of path.split('.')) current = current?.[key];
    if (current !== undefined && current !== null && current !== '') return current;
  }
  return null;
};

export const premblySessionId = (result) => text(nested(result, [
  'session_id', 'sessionId', 'data.session_id', 'data.sessionId',
  'data.widget_info.session_id', 'widget_info.session_id',
]));

export const premblySessionReference = (result) => text(nested(result, [
  'metadata.verification_reference', 'metadata.transaction_id',
  'data.metadata.verification_reference', 'data.metadata.transaction_id',
  'data.widget_info.metadata.verification_reference', 'data.widget_info.metadata.transaction_id',
  'data.widget_info.user_ref', 'widget_info.user_ref', 'user_ref',
]));

export const premblySessionEmail = (result) => text(nested(result, [
  'email', 'data.email', 'data.widget_info.email', 'widget_info.email',
]));

const faceConfidence = (result) => finiteNumber(nested(result, [
  'data.biometric_results.average_confidence', 'biometric_results.average_confidence',
  'data.verification_response.data.biometric_results.average_confidence',
  'data.face_data.confidence', 'face_data.confidence',
]));

const faceComparisonPassed = (result) => {
  const direct = nested(result, [
    'data.face_data.status', 'face_data.status', 'data.verification_response.data.face_data.status',
  ]);
  if (direct !== null) return isTrue(direct);
  const comparisons = nested(result, [
    'data.biometric_results.comparison_result', 'biometric_results.comparison_result',
  ]);
  if (Array.isArray(comparisons) && comparisons.length) {
    return comparisons.every((entry) => isTrue(entry?.result?.status));
  }
  return false;
};

export function premblyWidgetOutcome(result) {
  const verificationStatus = text(nested(result, [
    'verification.status', 'data.verification.status', 'data.status', 'status',
  ])).toLowerCase();
  const providerFinished = ['verified', 'success', 'successful', 'completed', 'passed'].includes(verificationStatus)
    || isTrue(nested(result, ['data.verification_response.status', 'verification_response.status']));
  const providerRejected = ['failed', 'rejected', 'declined', 'cancelled', 'canceled'].includes(verificationStatus);
  const confidence = faceConfidence(result);
  const facePassed = faceComparisonPassed(result) || (confidence !== null && confidence >= 80);
  if (providerFinished && facePassed) return 'verified';
  if (providerRejected || (providerFinished && !facePassed)) return 'rejected';
  return 'pending';
}

export async function fetchPremblySession(sessionId, fetchImpl = fetch) {
  const apiKey = getPremblyApiKey();
  const organisationId = getPremblyOrganisationId();
  if (!apiKey || !organisationId || !/^[A-Za-z0-9_-]{8,128}$/.test(text(sessionId))) {
    throw new PremblyVerificationError('PREMBLY_CONFIG_REQUIRED');
  }
  let response;
  try {
    response = await fetchImpl(`${PREMBLY_SESSION_URL}/${encodeURIComponent(text(sessionId))}/`, {
      headers: { accept: 'application/json', 'x-api-key': apiKey, 'x-organisation-id': organisationId },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new PremblyVerificationError('PREMBLY_LOOKUP_UNAVAILABLE', { uncertain: true });
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const code = response.status === 401
      ? 'PREMBLY_CREDENTIALS_INVALID'
      : response.status === 403
        ? 'PREMBLY_ACCESS_DENIED'
        : response.status === 404
          ? 'PREMBLY_SESSION_NOT_FOUND'
          : response.status === 429
            ? 'PREMBLY_RATE_LIMITED'
            : 'PREMBLY_LOOKUP_UNAVAILABLE';
    throw new PremblyVerificationError(code, { uncertain: response.status >= 500, providerStatus: response.status });
  }
  if (!result || typeof result !== 'object') throw new PremblyVerificationError('PREMBLY_RESPONSE_INVALID');
  return result;
}
