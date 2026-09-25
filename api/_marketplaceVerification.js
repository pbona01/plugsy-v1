const PREMBLY_BASE_URL = 'https://api.prembly.com/verification';

export const verificationMethods = {
  bvn_face: { endpoint: 'bvn_w_face', label: 'BVN + Face Validation', price: 80 },
  nin_face: { endpoint: 'nin_w_face', label: 'NIN + Face Validation', price: 150 },
};

const text = (value) => String(value || '').trim();

export function premblyOutcome(result, method, number) {
  const submittedNumber = text(number);
  const identity = method === 'bvn_face' ? (result?.data || result?.bvn_data) : result?.nin_data;
  const returnedNumber = text(identity?.bvn || identity?.nin || identity?.number);
  const faceMatched = (result?.face_data || result?.data?.face_data)?.status === true;
  const providerSucceeded = result?.status === true && String(result?.response_code || '00') === '00';
  return providerSucceeded && faceMatched && returnedNumber === submittedNumber ? 'verified' : 'rejected';
}

export async function verifyPremblyIdentity({ method, number, image, fetchImpl = fetch }) {
  const config = verificationMethods[method];
  const apiKey = text(process.env.PREMBLY_API_KEY);
  if (!config || !apiKey) throw new Error('PREMBLY_CONFIG_REQUIRED');

  const response = await fetchImpl(`${PREMBLY_BASE_URL}/${config.endpoint}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ number, image }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error('PREMBLY_LOOKUP_UNAVAILABLE');
  return response.json();
}
