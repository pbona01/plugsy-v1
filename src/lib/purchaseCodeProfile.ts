type TokenGetter = () => Promise<string | null>;

const request = async (getToken: TokenGetter, action: string, options: RequestInit = {}) => {
  const token = await getToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token || ''}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/purchase-code?action=${action}`, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || payload?.message || 'Purchase code could not be updated.');
  return payload;
};

export const loadSavedPurchaseCode = (getToken: TokenGetter) => request(getToken, 'saved');

export const saveDefaultPurchaseCode = (getToken: TokenGetter, code: string) => request(getToken, 'save', {
  method: 'POST',
  body: JSON.stringify({ code: code.trim().toUpperCase() }),
});

export const clearDefaultPurchaseCode = (getToken: TokenGetter) => request(getToken, 'clear', { method: 'POST' });

export const validatePurchaseCode = async (getToken: TokenGetter, code: string) => {
  const token = await getToken();
  const response = await fetch('/api/purchase-code?action=validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || 'Purchase code could not be checked.');
  return payload;
};
