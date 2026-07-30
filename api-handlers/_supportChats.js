export const isSupportChat = (chat) =>
  !["dm", "group", "channel"].includes(
    String(chat?.chat_type || "").toLowerCase(),
  );

const timestampValue = (value) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export const compareSupportChatsByActivity = (left, right) =>
  timestampValue(right.last_message_at) -
    timestampValue(left.last_message_at) ||
  timestampValue(right.updated_at) -
    timestampValue(left.updated_at) ||
  timestampValue(right.created_at) -
    timestampValue(left.created_at) ||
  String(left.id || "").localeCompare(String(right.id || ""));

const resolveCanonicalClerkUserId = async (supabase, userId) => {
  const suppliedUserId = String(userId || "").trim();
  if (!suppliedUserId) throw new Error("SUPPORT_CHAT_USER_REQUIRED");
  if (suppliedUserId.startsWith("user_")) return suppliedUserId;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clerk_id")
    .eq("id", suppliedUserId)
    .maybeSingle();
  if (profileError) throw new Error("SUPPORT_PROFILE_LOOKUP_FAILED");

  const canonicalUserId = String(profile?.clerk_id || "").trim();
  if (!canonicalUserId) throw new Error("SUPPORT_CLERK_USER_REQUIRED");
  return canonicalUserId;
};

export const resolveSupportChats = async (supabase, userId) => {
  const canonicalUserId = await resolveCanonicalClerkUserId(
    supabase,
    userId,
  );
  const { data: existingChats, error: lookupError } = await supabase
    .from("chats")
    .select(
      "id, user_id, chat_type, last_message_at, updated_at, created_at",
    )
    .eq("user_id", canonicalUserId);
  if (lookupError) throw new Error("SUPPORT_CHAT_LOOKUP_FAILED");

  return {
    canonicalUserId,
    chats: (existingChats || [])
      .filter(isSupportChat)
      .sort(compareSupportChatsByActivity),
  };
};

export const resolveExistingSupportChat = async (supabase, userId) => {
  const resolved = await resolveSupportChats(supabase, userId);
  return {
    canonicalUserId: resolved.canonicalUserId,
    chat: resolved.chats[0] || null,
  };
};

export const resolveOrCreateSupportChat = async (
  supabase,
  userId,
  userEmail,
) => {
  const resolved = await resolveExistingSupportChat(supabase, userId);
  if (resolved.chat) return resolved.chat;

  const { data: newChat, error: createError } = await supabase
    .from("chats")
    .insert({
      user_id: resolved.canonicalUserId,
      user_email: userEmail || null,
      status: "open",
      needs_admin_attention: false,
    })
    .select(
      "id, user_id, chat_type, last_message_at, updated_at, created_at",
    )
    .single();
  if (createError || !newChat) throw new Error("SUPPORT_CHAT_CREATE_FAILED");
  return newChat;
};
