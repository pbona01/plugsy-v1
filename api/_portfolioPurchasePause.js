export const PORTFOLIO_PURCHASE_PAUSE_CODE =
  "PORTFOLIO_PURCHASE_TEMPORARILY_PAUSED";

export const PORTFOLIO_PURCHASE_PAUSE_MESSAGE =
  "Portfolio purchases are temporarily paused while we complete an urgent fulfilment fix. Your wallet has not been charged.";

export function getPortfolioPurchasePause(purpose) {
  if (purpose !== "portfolio_purchase") return null;

  return {
    success: false,
    code: PORTFOLIO_PURCHASE_PAUSE_CODE,
    error: PORTFOLIO_PURCHASE_PAUSE_MESSAGE,
  };
}

export function getPortfolioInitializationPause(action) {
  if (action !== "purchase") return null;
  return getPortfolioPurchasePause("portfolio_purchase");
}
