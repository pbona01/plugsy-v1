import { useEffect, useState, useCallback } from 'react';
import { User } from '../types';
import { supabase } from '../lib/supabase';

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('clerk_id', userId)
        .maybeSingle();
      
      // HTML Protection
      if (typeof data === 'string' && (data as string).includes('<!doctype')) {
         setLoading(false);
         return;
      }

      if (error) {
         console.error("Profile fetch error details:", error.message, error.details);
         throw error;
      }
      if (data) {
        setProfile(data as unknown as User);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    fetchProfile();
  }, [userId, fetchProfile]);

  return { profile, loading, mutate: fetchProfile };
}

