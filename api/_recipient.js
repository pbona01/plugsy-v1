const CLERK_ID = /^user_[A-Za-z0-9_-]{3,}$/;

export const canonicalClerkId = (value) => {
  const id = String(value || "").trim();
  return CLERK_ID.test(id) ? id : "";
};

export async function mapBounded(values, worker, concurrency = 20) {
  const output = new Array(values.length);
  let cursor = 0;
  const run = async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await worker(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return output;
}

export async function canonicalizeChatMembers(supabase, rows) {
  const uniqueRows = [...new Map((rows || []).map((row) => [String(row?.user_id || ""), row])).values()];
  const resolved = await mapBounded(uniqueRows, (row) => resolveCanonicalClerkId(supabase, row?.user_id), 20);
  return [...new Set(resolved.filter(Boolean))];
}

export const classifyVerifiedAudience = (ids, profileAdmins = new Set(), clerkAdmins = new Set(), limit = 20000) => {
  const unique = [...new Set(ids.map(canonicalClerkId).filter(Boolean))];
  if (unique.length > limit) return { error: true, code: "AUDIENCE_LIMIT_EXCEEDED", admin: [], user: [] };
  const admin = unique.filter((id) => profileAdmins.has(id) || clerkAdmins.has(id));
  return { error: false, code: "OK", admin, user: unique.filter((id) => !admin.includes(id)) };
};

export const classifyCallRecipients = (chatType, memberIds, actorId) => {
  const unique = [...new Set(memberIds.map(canonicalClerkId).filter(Boolean))].filter((id) => id !== actorId);
  return String(chatType || "").toLowerCase() === "dm" ? (unique.length === 1 ? unique : []) : unique;
};

export const isSupportChat = (chat) => !["dm", "group", "channel"].includes(String(chat?.chat_type ?? chat?.chatType ?? "").toLowerCase());

export async function resolveCanonicalClerkId(supabase, value, email = "") {
  const direct = canonicalClerkId(value);
  if (direct) return direct;
  if (!supabase) return "";
  if (value) {
    const { data } = await supabase.from("profiles").select("clerk_id").eq("id", String(value)).maybeSingle();
    const resolved = canonicalClerkId(data?.clerk_id);
    if (resolved) return resolved;
  }
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return "";
  const { data, error } = await supabase.from("profiles").select("clerk_id").eq("email", normalizedEmail).limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return "";
  return canonicalClerkId(data[0]?.clerk_id);
}
