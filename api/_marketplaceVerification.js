export function dojahOutcome(result, reference) {
  if (!result || result.reference_id !== reference) throw new Error('VERIFICATION_REFERENCE_MISMATCH');
  if (['Ongoing','Pending'].includes(result.verification_status)) return 'pending';
  const idType = String(result.id_type || '').toLowerCase().replace(/[^a-z]/g,'');
  const allowed = ['nin','national','nationalid','passport','internationalpassport','dl','driverslicense','drivinglicense'].includes(idType);
  const documentPassed = result.data?.id?.status === true;
  const governmentPassed = idType === 'nin' && result.data?.government_data?.status === true;
  const failedStep = Object.values(result.data || {}).some(step => step?.status === false);
  const passed = !failedStep && result.verification_status === 'Completed' && result.status === true && allowed &&
    (documentPassed || governmentPassed) && result.data?.selfie?.status === true;
  return passed ? 'verified' : 'rejected';
}

export async function fetchDojahVerification(reference, fetchImpl = fetch) {
  const appId = process.env.DOJAH_APP_ID;
  const secret = process.env.DOJAH_SECRET_KEY;
  if (!appId || !secret) throw new Error('DOJAH_CONFIG_REQUIRED');
  const response = await fetchImpl(`https://api.dojah.io/api/v1/kyc/verification?${new URLSearchParams({reference_id:reference})}`, {
    headers: { AppId: appId, Authorization: secret }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('DOJAH_LOOKUP_UNAVAILABLE');
  return response.json();
}
