export const isAdmin = (user: any) => user?.publicMetadata?.role === 'admin';

export class ProfileSyncError extends Error {
  code: string;

  constructor(message: string, code = 'PROFILE_SYNC_FAILED') {
    super(message);
    this.name = 'ProfileSyncError';
    this.code = code;
  }
}

type GetToken = () => Promise<string | null>;

const inFlightSyncs = new Map<string, Promise<any>>();

export const syncClerkUserToSupabase = async (
  user: any,
  getToken?: GetToken,
): Promise<any> => {
  if (!user?.id) {
    throw new ProfileSyncError('A signed-in account is required.', 'AUTH_REQUIRED');
  }

  const existing = inFlightSyncs.get(user.id);
  if (existing) return existing;

  const syncPromise = (async () => {
    const token = getToken
      ? await getToken()
      : typeof window !== 'undefined' && (window as any).Clerk
        ? await (window as any).Clerk.session?.getToken()
        : null;

    if (!token) {
      throw new ProfileSyncError('Your session could not be verified.', 'AUTH_REQUIRED');
    }

    const response = await fetch('/api/sync-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success || data.profile?.clerk_id !== user.id) {
      throw new ProfileSyncError(
        'Your account profile could not be confirmed.',
        data?.code || 'PROFILE_SYNC_FAILED',
      );
    }

    return data.profile;
  })();

  inFlightSyncs.set(user.id, syncPromise);
  try {
    return await syncPromise;
  } finally {
    inFlightSyncs.delete(user.id);
  }
};





