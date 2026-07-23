import { supabase } from './supabase';

export const isAdmin = (user: any) => user?.publicMetadata?.role === 'admin';

export const syncClerkUserToSupabase = async (user: any): Promise<string> => {
  if (!user?.id) return 'user';
  
  const role = isAdmin(user) ? 'admin' : 'user';

  try {
    const token = typeof window !== 'undefined' && (window as any).Clerk ? await (window as any).Clerk.session?.getToken() : null;
    
    // 1. Sync profile to server
    await fetch('/api/sync-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ user, role })
    });
  } catch (error) {
    console.warn("Profile sync error bypassed: ", error);
  }
  
  return role;
};





