"use client";

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

// Initialize Supabase. Assume these env vars are set in your Next.js frontend.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface PurchaseCodeInputProps {
  currentUserSupabaseId?: string; // Optional: Pass this if you have the mapped Supabase UUID of the current user to prevent self-use
  onValidated: (result: {
    purchaseCodeUsed: string;
    purchaseCodeOwnerId: string;
    purchaseCodeOwnerName: string;
  }) => void;
  onCleared: () => void;
}

export default function PurchaseCodeInput({
  currentUserSupabaseId,
  onValidated,
  onCleared,
}: PurchaseCodeInputProps) {
  const [inputCode, setInputCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [codeApplied, setCodeApplied] = useState(false);
  const [purchaseCodeUsed, setPurchaseCodeUsed] = useState<string | null>(null);
  const [purchaseCodeOwnerId, setPurchaseCodeOwnerId] = useState<string | null>(null);
  const [purchaseCodeOwnerName, setPurchaseCodeOwnerName] = useState<string | null>(null);

  const handleValidate = async () => {
    const normalized = inputCode.trim().toUpperCase();
    if (!normalized) return;
    setValidating(true);
    setMessage(null);

    const { data, error } = await supabase.rpc("get_code_owner", {
      lookup_code: normalized,
    });

    console.log("RPC raw data:", data);
    console.log("RPC error:", error);

    if (error) {
      setMessage("Invalid purchase code.");
      setValidating(false);
      return;
    }

    // RPC returns array of rows
    const result = Array.isArray(data) ? data[0] : data;

    if (!result || result.valid === false) {
      setMessage("Invalid purchase code.");
      setValidating(false);
      return;
    }

    // Get current user id to prevent self-use (UUID string comparison)
    if (currentUserSupabaseId && result.owner_id === currentUserSupabaseId) {
      setMessage("You cannot use your own purchase code.");
      setValidating(false);
      return;
    }

    const displayName = result.owner_name ?? result.owner_email ?? "Unknown";

    // Resolve owner's clerk_id to prevent UUID mismatch in referral reward
    const { data: profileQuery } = await supabase
      .from("profiles")
      .select("clerk_id")
      .eq("id", result.owner_id)
      .maybeSingle();

    const finalOwnerClerkId = profileQuery?.clerk_id || result.owner_clerk_id || result.owner_id;

    setMessage("✅ Purchase code applied: " + displayName);
    setValidating(false);
    setCodeApplied(true);
    setPurchaseCodeUsed(normalized);
    setPurchaseCodeOwnerId(finalOwnerClerkId);
    setPurchaseCodeOwnerName(displayName);

    onValidated({
      purchaseCodeUsed: normalized,
      purchaseCodeOwnerId: finalOwnerClerkId,
      purchaseCodeOwnerName: displayName,
    });
  };

  const clearCode = () => {
    setInputCode("");
    setCodeApplied(false);
    setPurchaseCodeUsed(null);
    setPurchaseCodeOwnerId(null);
    setPurchaseCodeOwnerName(null);
    setMessage(null);
    onCleared();
  };

  return (
    <div className="flex flex-col gap-2 w-full max-w-sm mt-4">
      <label className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
        Affiliate / Purchase Code
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputCode}
          onChange={(e) => setInputCode(e.target.value.toUpperCase())}
          disabled={validating || codeApplied}
          placeholder="ENTER CODE"
          className={`flex-1 border px-3 py-2 rounded-md font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)] transition-colors ${
            codeApplied
              ? "border-green-500 text-green-500 bg-green-500/10"
              : "border-[var(--brand-border)] text-[var(--brand-text)] bg-[var(--brand-surface)]"
          }`}
        />
        {!codeApplied ? (
          <button
            onClick={handleValidate}
            disabled={validating || !inputCode.trim()}
            className="bg-[var(--brand-text)] text-[var(--brand-bg)] px-4 py-2 rounded-md font-medium hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px] transition-colors"
          >
            {validating ? <Loader2 size={16} className="animate-spin" /> : "Apply"}
          </button>
        ) : (
          <button
            onClick={clearCode}
            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-md font-medium hover:bg-red-100 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      {message && (
        <div
          className={`text-sm mt-1 font-medium ${
            codeApplied ? "text-green-600" : "text-red-600"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
