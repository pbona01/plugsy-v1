"use client";

import React, { useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import {
  clearStableIdempotencyKey,
  getStableIdempotencyKey,
} from "../utils/idempotency";

interface CheckoutButtonProps {
  planId: string;
  purchaseCodeUsed: string | null;
  purchaseCodeOwnerId: string | null;
  purchaseCodeOwnerName: string | null;
}

export default function CheckoutButton({
  planId,
  purchaseCodeUsed,
  purchaseCodeOwnerId,
  purchaseCodeOwnerName,
}: CheckoutButtonProps) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (!isLoaded) return;
    
    // Safety check for user details
    const userEmail = user?.primaryEmailAddress?.emailAddress;
    if (!userEmail) {
      setError("You must have a verified email address to checkout.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/payments?action=purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": getStableIdempotencyKey(`product:${planId}`),
        },
        body: JSON.stringify({
          planId,
          purchaseCode: purchaseCodeUsed,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        clearStableIdempotencyKey(`product:${planId}`);
        window.location.href = `/payment/callback?reference=${encodeURIComponent(data.reference)}`;
      } else {
        setError(data.error || "Failed to initialize payment.");
        setLoading(false);
      }
    } catch (e: any) {
      console.error("[CheckoutButton] request failed");
      setError(e?.message || "A network error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full mt-4">
      <button
        onClick={handleCheckout}
        disabled={loading || !isLoaded}
        className="w-full bg-[var(--brand-text)] text-[var(--brand-bg)] font-bold py-3 px-4 rounded-md hover:bg-opacity-80 disabled:opacity-60 flex items-center justify-center transition-colors uppercase tracking-wider"
      >
        {loading ? <Loader2 size={24} className="animate-spin" /> : "Proceed to Checkout"}
      </button>

      {error && (
        <div className="text-red-500 text-sm font-medium mt-2 text-center">
          {error}
        </div>
      )}
    </div>
  );
}
