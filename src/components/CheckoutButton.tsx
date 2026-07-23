"use client";

import React, { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

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

    const payload = {
      userId: user?.id || null,
      userEmail: userEmail,
      fullName: user?.fullName || `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || userEmail.split("@")[0],
      planId,
      purchaseCodeUsed,
      purchaseCodeOwnerId,
      purchaseCodeOwnerName,
    };

    console.log("[CheckoutButton] initiating with:", payload);

    try {
      const res = await fetch("/api/payments?action=initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Notice we don't pass Authorization header because it's a public route 
        // to prevent Clerk 405 error, but we pass the userId directly in the body
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      console.log("[CheckoutButton] raw response:", text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error("Failed to parse JSON response:", parseErr);
        setError("Invalid response from server. Check your console logs.");
        setLoading(false);
        return;
      }

      if (data.success && data.authorization_url) {
        console.log("[CheckoutButton] Redirecting to:", data.authorization_url);
        window.location.href = data.authorization_url;
      } else {
        console.error("[CheckoutButton] Server returned error:", data.error);
        setError(data.error || "Failed to initialize payment.");
        setLoading(false);
      }
    } catch (e: any) {
      console.error("[CheckoutButton] Network/Fetch Error:", e);
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
