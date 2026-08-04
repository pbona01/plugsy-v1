import { canonicalClerkId } from "./_recipient.js";

export const subscriptionActorCode = (expectedUserId, actorUserId) => {
  const expected = canonicalClerkId(expectedUserId);
  return expected && expected === actorUserId ? "OK" : "SUBSCRIPTION_ACTOR_CHANGED";
};
