import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase';

interface OnlinePresenceContextType {
  onlineUserIds: Set<string>;
  isUserOnline: (id: string | null | undefined, lastLoginAt?: string | null) => boolean;
}

const OnlinePresenceContext = createContext<OnlinePresenceContextType | undefined>(undefined);

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setOnlineUserIds(new Set());
      return;
    }

    let channel: any = null;

    const setupPresence = async () => {
      try {
        // Fetch current user's database profile ID to track both Clerk ID and Profile ID
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id')
          .eq('clerk_id', userId)
          .maybeSingle();

        const profileId = profileData?.id;

        // Subscribe to online-users channel with presence configured
        channel = supabase.channel('online-users', {
          config: {
            presence: {
              key: userId,
            },
          },
        });

        channel
          .on('presence', { event: 'sync' }, () => {
            const presenceState = channel.presenceState();
            const onlineSet = new Set<string>();

            Object.values(presenceState).forEach((presences: any) => {
              presences.forEach((p: any) => {
                if (p.clerk_id) onlineSet.add(p.clerk_id);
                if (p.profile_id) onlineSet.add(p.profile_id);
              });
            });

            setOnlineUserIds(onlineSet);
          })
          .subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
              await channel.track({
                clerk_id: userId,
                profile_id: profileId || userId,
                online_at: new Date().toISOString(),
              });
            }
          });
      } catch (err) {
        console.warn('[OnlinePresence] Error setting up presence channel:', err);
      }
    };

    setupPresence();

    return () => {
      if (channel) {
        supabase.removeChannel(channel).catch((err) => {
          console.warn('[OnlinePresence] Error removing presence channel:', err);
        });
      }
    };
  }, [userId]);

  const isUserOnline = (id: string | null | undefined, lastLoginAt?: string | null): boolean => {
    if (!id) return false;
    
    // 1. Check if the user is in our real-time presence Set
    if (onlineUserIds.has(id)) {
      return true;
    }
    
    // 2. Heartbeat database fallback (60-second window)
    if (lastLoginAt) {
      const timeDiff = Date.now() - new Date(lastLoginAt).getTime();
      if (timeDiff < 60000) {
        return true;
      }
    }
    
    return false;
  };

  return (
    <OnlinePresenceContext.Provider value={{ onlineUserIds, isUserOnline }}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlinePresence() {
  const context = useContext(OnlinePresenceContext);
  if (context === undefined) {
    throw new Error('useOnlinePresence must be used within an OnlinePresenceProvider');
  }
  return context;
}
