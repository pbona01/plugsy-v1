const text = (value) => String(value || "").trim();
const normalizedEmail = (value) => text(value).toLowerCase();
const profileSyncLocks = new Map();

const PROFILE_FIELDS = [
  "id",
  "clerk_id",
  "email",
  "full_name",
  "username",
  "role",
  "image_url",
  "profile_pic_url",
  "balance",
  "bio",
  "phone_number",
  "last_login_at",
  "created_at",
  "updated_at",
].join(",");

const escapedIlike = (value) =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const normalizeProfile = (profile) => ({
  ...profile,
  clerk_id: text(profile?.clerk_id),
  email: normalizedEmail(profile?.email),
  role: text(profile?.role).toLowerCase() || "user",
});

async function performVerifiedClerkProfileSync({ supabase, actor }) {
  const clerkId = text(actor?.userId);
  const email = normalizedEmail(actor?.email);

  if (!clerkId || !email) {
    return {
      success: false,
      status: 400,
      code: "SYNC_IDENTITY_INVALID",
      error: "The verified account identity is incomplete.",
    };
  }

  const clerkUser = actor.clerkUser || {};
  const clerkRole = text(
    clerkUser.publicMetadata?.role ||
      clerkUser.public_metadata?.role ||
      "user",
  ).toLowerCase() || "user";
  const fullName = text(actor.fullName);
  const clerkUsername = text(clerkUser.username).toLowerCase();
  const imageUrl = text(clerkUser.imageUrl || clerkUser.image_url);

  const { data: linkedRows, error: linkedError } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("clerk_id", clerkId)
    .limit(2);

  if (linkedError) {
    throw new Error("Profile linkage lookup failed");
  }

  if ((linkedRows || []).length > 1) {
    return {
      success: false,
      status: 409,
      code: "SYNC_DUPLICATE_LINK",
      error: "Account linkage needs administrator review.",
    };
  }

  let existing = linkedRows?.[0] || null;

  if (!existing) {
    const { data: emailRows, error: emailError } = await supabase
      .from("profiles")
      .select(PROFILE_FIELDS)
      .ilike("email", escapedIlike(email))
      .limit(3);

    if (emailError) {
      throw new Error("Legacy profile lookup failed");
    }

    const exactEmailRows = (emailRows || []).filter(
      (profile) => normalizedEmail(profile.email) === email,
    );

    if (exactEmailRows.length > 1) {
      return {
        success: false,
        status: 409,
        code: "SYNC_AMBIGUOUS_EMAIL",
        error: "Account linkage needs administrator review.",
      };
    }

    const candidate = exactEmailRows[0] || null;
    if (candidate && text(candidate.clerk_id) && text(candidate.clerk_id) !== clerkId) {
      return {
        success: false,
        status: 409,
        code: "SYNC_EMAIL_ALREADY_LINKED",
        error: "Account linkage needs administrator review.",
      };
    }
    existing = candidate;
  }

  const identityPatch = {
    clerk_id: clerkId,
    email,
    role: clerkRole,
    updated_at: new Date().toISOString(),
  };

  if (fullName) identityPatch.full_name = fullName;
  if (imageUrl) identityPatch.image_url = imageUrl;
  if (clerkUsername && !text(existing?.username)) {
    identityPatch.username = clerkUsername;
  }

  let result;
  if (existing) {
    result = await supabase
      .from("profiles")
      .update(identityPatch)
      .eq("id", existing.id)
      .select(PROFILE_FIELDS)
      .single();
  } else {
    result = await supabase
      .from("profiles")
      .insert(identityPatch)
      .select(PROFILE_FIELDS)
      .single();
  }

  if (result.error || !result.data) {
    throw new Error("Profile synchronization failed");
  }

  const profile = normalizeProfile(result.data);
  if (profile.clerk_id !== clerkId) {
    throw new Error("Profile linkage confirmation failed");
  }

  return {
    success: true,
    status: 200,
    profile,
  };
}

export async function syncVerifiedClerkProfile({ supabase, actor }) {
  const clerkId = text(actor?.userId);
  if (!clerkId) return performVerifiedClerkProfileSync({ supabase, actor });

  const existing = profileSyncLocks.get(clerkId);
  if (existing) return existing;

  const operation = performVerifiedClerkProfileSync({ supabase, actor });
  profileSyncLocks.set(clerkId, operation);
  try {
    return await operation;
  } finally {
    if (profileSyncLocks.get(clerkId) === operation) profileSyncLocks.delete(clerkId);
  }
}
