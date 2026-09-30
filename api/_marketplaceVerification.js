const PREMBLY_BASE_URL = 'https://api.prembly.com/verification';

export const verificationMethods = {
  bvn_face: { endpoint: 'bvn_w_face', label: 'BVN + Face Validation' },
  nin_face: { endpoint: 'nin_w_face', label: 'NIN + Face Validation' },
};

const text = (value) => String(value || '').trim();
const digits = (value) => text(value).replace(/\D/g, '');
const isTrue = (value) => value === true || value === 1 || text(value).toLowerCase() === 'true' || text(value) === '1';
const responseCode = (result) => {
  const value = text(result?.response_code);
  return value === '0' ? '00' : value;
};

export const getPremblyApiKey = () => text(
  process.env.PREMBLY_API_KEY || process.env.PREMBLY_SECRET_KEY || process.env.IDENTITYPASS_API_KEY,
);

export const hasPremblyConfiguration = () => Boolean(getPremblyApiKey());

export class PremblyVerificationError extends Error {
  constructor(code, { uncertain = false, providerStatus = null } = {}) {
    super(code);
    this.name = 'PremblyVerificationError';
    this.code = code;
    this.uncertain = uncertain;
    this.providerStatus = providerStatus;
  }
}

export function premblyOutcome(result, method, number) {
  const submittedNumber = digits(number);
  const identity = method === 'bvn_face' ? (result?.data || result?.bvn_data) : result?.nin_data;
  const faceData = result?.face_data || result?.data?.face_data;
  const returnedNumber = digits(identity?.bvn || identity?.nin || identity?.number);
  const code = responseCode(result) || '00';
  const providerSucceeded = isTrue(result?.status) && code === '00';
  if (providerSucceeded && (!identity || !faceData || !returnedNumber)) {
    throw new PremblyVerificationError('PREMBLY_RESPONSE_INVALID');
  }
  const faceMatched = isTrue(faceData?.status);
  return providerSucceeded && faceMatched && returnedNumber === submittedNumber ? 'verified' : 'rejected';
}

export async function verifyPremblyIdentity({ method, number, image, fetchImpl = fetch }) {
  const config = verificationMethods[method];
  const apiKey = getPremblyApiKey();
  if (!config || !apiKey) throw new Error('PREMBLY_CONFIG_REQUIRED');

  let response;
  try {
    response = await fetchImpl(`${PREMBLY_BASE_URL}/${config.endpoint}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ number, image }),
      signal: AbortSignal.timeout(45_000),
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
        : response.status === 413
          ? 'PREMBLY_IMAGE_TOO_LARGE'
          : [400, 422].includes(response.status)
            ? 'PREMBLY_INPUT_REJECTED'
            : response.status === 429
              ? 'PREMBLY_RATE_LIMITED'
              : 'PREMBLY_LOOKUP_UNAVAILABLE';
    throw new PremblyVerificationError(code, {
      uncertain: response.status >= 500,
      providerStatus: response.status,
    });
  }
  if (!result || typeof result !== 'object') throw new PremblyVerificationError('PREMBLY_RESPONSE_INVALID');

  const code = responseCode(result);
  if (code === '02') throw new PremblyVerificationError('PREMBLY_SERVICE_UNAVAILABLE');
  if (code === '03') throw new PremblyVerificationError('PREMBLY_WALLET_EMPTY');
  if (!['', '00', '01', '07'].includes(code)) throw new PremblyVerificationError('PREMBLY_REQUEST_REJECTED');
  return result;
}
