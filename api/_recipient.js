const CLERK_ID = /^user_[A-Za-z0-9_-]{3,}$/;

export const canonicalClerkId = (value) => {
  const id = String(value || "").trim();
  return CLERK_ID.test(id) ? id : "";
};

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
