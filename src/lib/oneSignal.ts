import {
  initOneSignal as originalInit,
  getPlayerId,
  requestNotificationPermission,
  isSubscribed,
  silentlyLinkOneSignalUser
} from "../utils/onesignal";

export { isSubscribed as checkOneSignalSubscribed, silentlyLinkOneSignalUser };
export const initOneSignal = originalInit;
export const getOneSignalPlayerId = getPlayerId;

export const requestOneSignalPermission = async (): Promise<boolean> => {
  return requestNotificationPermission();
};
