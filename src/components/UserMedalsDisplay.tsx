import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

interface UserMedal {
  medal_tier: string;
  medal_number: number;
}

interface UserMedalsDisplayProps {
  userId?: string;
}

export const UserMedalsDisplay: React.FC<UserMedalsDisplayProps> = ({ userId: propUserId }) => {
  const { userId: authUserId } = useAuth();
  const userId = propUserId || authUserId;
  const [medal, setMedal] = useState<UserMedal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchMedal = async () => {
      try {
        const res = await fetch(`/api/payments?action=get-medal-status&userId=${userId}`);
        const data = await res.json();
        
        if (data?.success && data?.medal) {
          setMedal({
            medal_tier: data.medal.name.split(" ")[1], // Extract Bronze/Silver/Gold
            medal_number: data.medalNumber
          });
        }
      } catch (err) {
        console.error("Error fetching medal:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMedal();
  }, [userId]);

  if (loading) return <div className="animate-pulse bg-slate-200 h-10 w-20 rounded"></div>;
  if (!medal || !medal.medal_tier) return null;

  return (
    <div className="flex items-center gap-2 bg-gradient-to-r from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 px-3 py-1.5 rounded-full border border-amber-300 dark:border-amber-700">
      <span className="text-amber-800 dark:text-amber-200 font-bold text-xs uppercase tracking-wider">
        {medal.medal_tier} Medal
      </span>
      <span className="text-amber-900 dark:text-amber-100 font-mono font-bold text-sm">
        #{medal.medal_number}
      </span>
    </div>
  );
};
