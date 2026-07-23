/**
 * Converts amount from naira to kobo for Paystack
 * @param {number} naira - Amount in Nigerian Naira
 * @returns {number} Amount in kobo (multiply by 100)
 */
export const toKobo = (naira: number | string): number => Math.round(Number(naira) * 100);

/**
 * Masks email for privacy display
 * @param {string} email - Full email address
 * @returns {string} Masked email like "you***@gmail.com"
 */
export const maskEmail = (email: string | undefined): string => {
  if (!email) return "Unknown";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return local.slice(0, 3) + "***@" + domain;
};

/**
 * Calculates subscription expiry date
 * @param {number} months - Number of months
 * @returns {string} ISO date string of expiry
 */
export const calculateExpiry = (months: number): string => {
  const date = new Date();
  date.setMonth(date.getMonth() + (months || 1));
  return date.toISOString();
};
