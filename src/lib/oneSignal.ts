import {
  initOneSignal as originalInit,
  getPlayerId,
  requestNotificationPermission,
  isSubscribed,
  silentlyLinkOneSignalUser,
  type TokenProvider
} from "../utils/onesignal";

export { isSubscribed as checkOneSignalSubscribed, silentlyLinkOneSignalUser };
export const initOneSignal = originalInit;
export const getOneSignalPlayerId = getPlayerId;

export const requestOneSignalPermission = async (userId?: string, tokenProvider?: TokenProvider) => {
  return requestNotificationPermission(userId, tokenProvider);
};
