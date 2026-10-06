export const marketplaceTrustBand = (score) => {
  if (!Number.isFinite(score)) return null;
  if (score < 50) return { label: "At risk", color: "red" };
  if (score < 65) return { label: "Fair", color: "orange" };
  if (score < 80) return { label: "Good", color: "yellow" };
  return { label: "Strong", color: "green" };
};

export const computeMarketplaceTrustScore = ({ completedOrders = 0, upheldDisputes = 0 } = {}) => {
  const completed = Number(completedOrders);
  const upheld = Number(upheldDisputes);
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(upheld) || completed < 0 || upheld < 0) return null;
  const outcomes = completed + upheld;
  return outcomes > 0 ? Math.round((100 * completed) / outcomes) : null;
};
