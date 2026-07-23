/**
 * Helper to process Cloudinary URLs with optimizations
 * f_auto: automatic format selection (WebP, AVIF, etc.)
 * q_auto: automatic quality compression
 */
export function optimizeCloudinaryUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (!url.includes('cloudinary.com')) return url;

  // If it already has transformations, add to them or replace
  if (url.includes('/upload/')) {
    // Check if it already has optimizations to avoid duplicates
    if (url.includes('f_auto') || url.includes('q_auto')) return url;
    
    return url.replace('/upload/', '/upload/f_auto,q_auto/');
  }

  return url;
}
