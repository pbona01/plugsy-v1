/** Keep post-auth navigation on this site, even when the URL is supplied by a visitor. */
export function safeAuthRedirect(value: string | null | undefined, fallback = '/dashboard') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  return value;
}
