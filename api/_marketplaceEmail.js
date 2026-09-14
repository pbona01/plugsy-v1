const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function buildMarketplaceEmail(job) {
  const title = String(job.payload?.title || 'Digital product');
  const amount = `₦${Number(job.payload?.amount || 0).toLocaleString('en-NG')}`;
  const subject = job.kind === 'refund' ? 'Your Plugsy marketplace refund' : job.kind === 'seller_release' ? 'Your marketplace earnings are available' : 'Your Plugsy marketplace purchase';
  const copy = job.kind === 'refund' ? `${amount} has been returned to your Plugsy wallet. Product access has been revoked.` : job.kind === 'seller_release' ? `${amount} is now available in your Plugsy wallet after the buyer-protection hold.` : `Your purchase of ${title} for ${amount} is available in My library. You have 10 hours from purchase to report a genuine product issue.`;
  const url = job.kind === 'seller_release' ? 'https://www.plugsy.ng/wallet' : 'https://www.plugsy.ng/marketplace';
  return { from: 'Plugsy <hello@plugsy.ng>', to: job.recipient, subject, text: `${copy}\nOrder: ${job.payload?.reference || ''}\nOpen Plugsy: ${url}`, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><h1 style="font-size:24px">${escapeHtml(subject)}</h1><p style="line-height:1.7">${escapeHtml(copy)}</p><p>Order: ${escapeHtml(job.payload?.reference)}</p><a href="${url}" style="display:inline-block;background:#0066ff;color:white;padding:14px 20px;border-radius:10px;text-decoration:none">Open Plugsy</a></div>` };
}
