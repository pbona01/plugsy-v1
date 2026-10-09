import adminHandler from '../api-handlers/admin.js'
import bookingsHandler from '../api-handlers/bookings.js'
import callsHandler from '../api-handlers/calls.js'
import categoriesHandler from '../api-handlers/categories.js'
import statusHandler from '../api-handlers/status.js'
import purchaseCodeHandler from '../api-handlers/purchase-code.js'
import androidAssetlinksHandler from '../api-handlers/android-assetlinks.js'
import portfolioAdsHandler from '../api-handlers/portfolio-ads.js'

export default async function handler(req, res) {
  const url = req.url || req.originalUrl || '';
  const route = req.query?.route || '';
  
  if (route === 'admin' || url.includes('/api/admin')) return adminHandler(req, res);
  if (route === 'bookings' || url.includes('/api/bookings')) return bookingsHandler(req, res);
  if (route === 'calls' || url.includes('/api/calls')) return callsHandler(req, res);
  if (route === 'categories' || url.includes('/api/categories')) return categoriesHandler(req, res);
  if (route === 'status' || url.includes('/api/status')) return statusHandler(req, res);
  if (route === 'purchase-code' || url.includes('/api/purchase-code')) return purchaseCodeHandler(req, res);
  if (route === 'android-assetlinks') return androidAssetlinksHandler(req, res);
  if (route === 'portfolio-ads' || url.includes('/api/portfolio-ads')) return portfolioAdsHandler(req, res);
  
  return res.status(404).json({ error: "Unknown route in misc proxy", url, route })
}
