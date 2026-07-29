import React, { useState, useEffect } from "react";
import { X, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import {
  clearStableIdempotencyKey,
  getStableIdempotencyKey,
} from "../../utils/idempotency";

interface SendMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  senderId: string;
  senderEmail: string;
  onSuccess: () => void;
  onOpenFunding: () => void;
}

export default function SendMoneyModal({
  isOpen,
  onClose,
  balance,
  senderId,
  senderEmail,
  onSuccess,
  onOpenFunding,
}: SendMoneyModalProps) {
  const [recipientInput, setRecipientInput] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);
  const { getToken } = useAuth();

  // Clean username helper
  const getCleanUsername = (val: string) => {
    return val.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "");
  };

  // Debounce resolve username
  useEffect(() => {
    const username = getCleanUsername(recipientInput);
    if (username.length < 3) {
      setResolvedName(null);
      setResolveError(null);
      return;
    }

    setIsValidating(true);
    setResolveError(null);
    setResolvedName(null);

    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/wallet?action=resolve-username", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ username }),
        });
        const data = await res.json();
        if (data.success) {
          setResolvedName(data.fullName);
        } else {
          setResolveError(data.error || "User not found");
        }
      } catch (err) {
        setResolveError("Unable to resolve username");
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [recipientInput]);

  if (!isOpen) return null;

  const amount = Number(amountInput) || 0;
  const TRANSFER_FEE = 0;
  const totalDeduction = amount + TRANSFER_FEE;
  const isBalanceInsufficient = amount > 0 && balance < totalDeduction;

  const canSend =
    resolvedName &&
    amount >= 10 &&
    !isBalanceInsufficient &&
    !isValidating &&
    !isSending;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    setIsSending(true);
    setSendError(null);

      try {
      const token = await getToken();
      const key = getStableIdempotencyKey(`p2p:${getCleanUsername(recipientInput)}`);
      const res = await fetch("/api/wallet?action=p2p-transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          recipientUsername: getCleanUsername(recipientInput),
          amount,
          note,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Transfer failed");
      }

      clearStableIdempotencyKey(`p2p:${getCleanUsername(recipientInput)}`);
      setSentSuccess(true);
    } catch (err: any) {
      setSendError(err.message || "Something went wrong");
    } finally {
      setIsSending(false);
    }
  };

  const handleDone = () => {
    onSuccess();
    onClose();
    // Reset state
    setRecipientInput("");
    setResolvedName(null);
    setResolveError(null);
    setAmountInput("");
    setNote("");
    setSentSuccess(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
      {/* Background click dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet / Modal Container */}
      <div className="relative w-full max-w-md bg-brand-surface border border-brand-border rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom duration-300">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send size={18} className="text-brand-accent rotate-[-45deg]" />
            <h3 className="text-base font-black uppercase tracking-widest text-brand-text-primary">
              Send to Plugsy User
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-brand-text/5 text-brand-text-secondary hover:text-brand-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {sentSuccess ? (
            /* Success Screen */
            <div className="text-center py-8 space-y-6">
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto scale-110">
                <CheckCircle2 size={36} />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-brand-text-primary">
                  Transfer Successful!
                </h4>
                <p className="text-sm text-brand-text-secondary max-w-xs mx-auto">
                  You successfully sent <span className="font-bold text-brand-text-primary">₦{amount.toLocaleString()}</span> to <span className="font-semibold text-brand-accent">@{getCleanUsername(recipientInput)}</span> ({resolvedName}).
                </p>
                {note && (
                  <p className="text-xs text-brand-text-secondary bg-brand-text/5 inline-block px-3 py-1.5 rounded-lg mt-2 italic">
                    "{note}"
                  </p>
                )}
              </div>
              <button
                onClick={handleDone}
                className="w-full bg-brand-accent hover:bg-brand-accent/95 text-white font-black uppercase tracking-wider text-xs py-3.5 rounded-xl transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            /* Form Screen */
            <form onSubmit={handleSend} className="space-y-5">
              {/* Step 1: Recipient Username */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">
                  Recipient Username
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary font-bold">@</span>
                  <input
                    type="text"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    placeholder="username"
                    className="w-full bg-brand-background border border-brand-border rounded-xl py-3 pl-8 pr-4 text-brand-text-primary placeholder-brand-text-secondary/50 focus:outline-none focus:border-brand-accent transition-all text-sm font-semibold"
                    disabled={isSending}
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </div>

                {/* Status indicator / Live resolver result */}
                {recipientInput.length > 0 && (
                  <div className="text-xs pl-1">
                    {isValidating && (
                      <span className="text-brand-text-secondary flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></span>
                        Verifying username...
                      </span>
                    )}
                    {!isValidating && resolvedName && (
                      <span className="text-green-500 font-semibold flex items-center gap-1">
                        ✓ Sending to: {resolvedName}
                      </span>
                    )}
                    {!isValidating && resolveError && (
                      <span className="text-red-500 font-semibold flex items-center gap-1">
                        ✗ {resolveError}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Amount & Fees */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary font-bold">₦</span>
                  <input
                    type="number"
                    min="10"
                    step="any"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-brand-background border border-brand-border rounded-xl py-3 pl-8 pr-4 text-brand-text-primary placeholder-brand-text-secondary/50 focus:outline-none focus:border-brand-accent transition-all text-sm font-semibold"
                    disabled={isSending}
                    required
                  />
                </div>
                {amount > 0 && amount < 10 && (
                  <p className="text-[10px] text-red-500 font-semibold mt-1 pl-1">
                    Minimum transfer is ₦10
                  </p>
                )}
                {(!amount || amount >= 10) && (
                  <p className="text-[10px] text-brand-text-secondary mt-1 pl-1">
                    Minimum transfer is ₦10
                  </p>
                )}

                {/* Fee breakdown block */}
                {amount > 0 && (
                  <div className="bg-brand-text/[0.02] border border-brand-border/60 rounded-xl p-4.5 space-y-2.5 text-xs">
                    <div className="flex justify-between text-brand-text-secondary">
                      <span>Amount</span>
                      <span>₦{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-brand-text-secondary">
                      <span>Transfer fee</span>
                      <span>₦{TRANSFER_FEE.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-black text-brand-text-primary pt-2.5 border-t border-brand-border">
                      <span>Total Debit</span>
                      <span className="text-brand-accent font-bold">
                        ₦{totalDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Optional Note */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">
                  What's this for? (Optional)
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. split lunch bill, support, etc."
                  className="w-full bg-brand-background border border-brand-border rounded-xl py-3 px-4 text-brand-text-primary placeholder-brand-text-secondary/50 focus:outline-none focus:border-brand-accent transition-all text-sm font-semibold"
                  disabled={isSending}
                />
              </div>

              {/* Error messages / warnings */}
              {isBalanceInsufficient && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between text-xs text-red-500">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle size={14} />
                    Insufficient balance — fund your wallet first
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFunding();
                    }}
                    className="text-brand-accent hover:underline font-bold"
                  >
                    Fund Wallet
                  </button>
                </div>
              )}

              {sendError && (
                <p className="text-xs font-semibold text-red-500 bg-red-500/5 p-3 rounded-lg text-center">
                  {sendError}
                </p>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!canSend}
                className="w-full bg-brand-accent hover:bg-brand-accent/95 disabled:bg-brand-text/10 disabled:text-brand-text-secondary disabled:cursor-not-allowed text-white font-black uppercase tracking-wider text-xs py-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                {isSending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={14} className="rotate-[-45deg]" />
                    Send money
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
