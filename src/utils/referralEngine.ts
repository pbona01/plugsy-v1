export const REFERRAL_COMMISSION_RATE = 0.10

export const calculateReferralCommission = (amount: number): number => {
  return Math.round(amount * REFERRAL_COMMISSION_RATE)
}
