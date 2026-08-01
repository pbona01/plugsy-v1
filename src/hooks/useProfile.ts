import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type ProfileRecord = Record<string, any>;

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      setError(false);
      return null;
    }
    setError(false);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('clerk_id', userId)
        .maybeSingle();
      
      // HTML Protection
      if (typeof data === 'string' && (data as string).includes('<!doctype')) {
         setLoading(false);
         setError(true);
         return null;
      }

      if (error) {
         console.error("Profile fetch error details:", error.message, error.details);
         throw error;
      }
      if (data) {
        setProfile(data as ProfileRecord);
        return data as ProfileRecord;
      }
      setProfile(null);
      return null;
    } catch (err) {
      console.error("Profile fetch error:", err);
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    fetchProfile();
  }, [userId, fetchProfile]);

  return { profile, loading, error, mutate: fetchProfile };
}

