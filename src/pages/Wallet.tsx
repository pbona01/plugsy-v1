import React, { useState, useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building2, 
  AlertCircle, 
  History, 
  Wallet as WalletIcon, 
  ChevronRight, 
  CheckCircle2, 
  Settings, 
  Lock, 
  Unlock, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  QrCode, 
  HelpCircle, 
  Send, 
  Plus, 
  Search, 
  Building, 
  ArrowLeft, 
  Check, 
  ShoppingCart, 
  X,
  Copy,
  Loader2
} from 'lucide-react';
import BankAccountForm from "@/components/wallet/BankAccountForm";
import SendMoneyModal from "@/components/wallet/SendMoneyModal";
import {
  clearStableIdempotencyKey,
  getStableIdempotencyKey,
} from "../utils/idempotency";
import { syncClerkUserToSupabase } from "../lib/authUtils";

const WALLET_FUNDING_PAUSED_MESSAGE =
  "Wallet deposits are temporarily paused while we complete an urgent balance-credit fix. No payment has been initiated.";

const getWithdrawalFee = (amount: number): number => {
  const amt = Number(amount) || 0;
  if (amt < 1000) return 25;
  if (amt < 10000) return 25;
  if (amt < 100000) return 100;
  if (amt < 1000000) return 500;
  return 5000;
};

interface WalletProps {
  showHistoryOnly?: boolean;
}

export const Wallet = ({ showHistoryOnly = false }: WalletProps) => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0);
  const [profile, setProfile] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletAvailability, setWalletAvailability] = useState<'loading' | 'syncing' | 'ready' | 'unavailable'>('loading');
  const [walletError, setWalletError] = useState<string | null>(null);
  const walletLoadInFlightRef = useRef(false);

  // Balance visibility toggle
  const [balanceVisible, setBalanceVisible] = useState(() => {
    const saved = localStorage.getItem('plugsy_balance_visible');
    return saved === null ? true : saved === 'true';
  });

  // Username prompt states
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [showUsernameBanner, setShowUsernameBanner] = useState(() => {
    return sessionStorage.getItem('plugsy_dismiss_username_prompt') !== 'true';
  });

  // Fund state
  const [fundAmount, setFundAmount] = useState('');
  const [isFunding, setIsFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const FEE = getWithdrawalFee(Number(withdrawAmount) || 0);
  const hasWithdrawalBankAccount = Boolean(
    profile?.bank_code &&
    profile?.bank_name &&
    /^\d{10}$/.test(String(profile?.account_number || "")) &&
    profile?.account_name
  );

  // PIN Security states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [viewRequirePin, setViewRequirePin] = useState(false);
  const [pinChangeError, setPinChangeError] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);

  // View Lock State
  const [isViewLocked, setIsViewLocked] = useState(false);
  const [viewUnlockPin, setViewUnlockPin] = useState('');
  const [viewUnlockError, setViewUnlockError] = useState('');
  const [isVerifyingViewPin, setIsVerifyingViewPin] = useState(false);

  // Withdraw auth state
  const [isWithdrawAuthOpen, setIsWithdrawAuthOpen] = useState(false);
  const [withdrawPin, setWithdrawPin] = useState('');
  const [withdrawPinError, setWithdrawPinError] = useState('');

  // Modal display toggles
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [showBankBanner, setShowBankBanner] = useState(true);

  // Search and filters for full history view
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');

  // Copy state
  const [copied, setCopied] = useState(false);
  const handleCopyTag = () => {
    if (profile?.username) {
      navigator.clipboard.writeText(`@${profile.username}`);
      setCopied(true);
      toast.success("Wallet TAG copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Settings Username Input State
  const [settingsUsernameInput, setSettingsUsernameInput] = useState('');
  const [settingsUsernameError, setSettingsUsernameError] = useState<string | null>(null);
  const [isSavingSettingsUsername, setIsSavingSettingsUsername] = useState(false);

  useEffect(() => {
    if (profile?.username) {
      setSettingsUsernameInput(profile.username);
    }
  }, [profile]);

  const handleSaveSettingsUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = settingsUsernameInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    
    if (clean.length < 3) {
      setSettingsUsernameError("Username must be at least 3 characters");
      return;
    }

    if (clean === profile?.username) {
      toast.success("TAG is already set to this!");
      return;
    }

    setIsSavingSettingsUsername(true);
    setSettingsUsernameError(null);

    try {
      const res = await fetch("/api/wallet?action=update-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await getToken()}`,
          "Idempotency-Key": getStableIdempotencyKey("username"),
        },
        body: JSON.stringify({ 
          username: clean,
        })
      });
      const result = await res.json();

      if (!result.success) {
        setSettingsUsernameError(result.error || "Failed to update username");
        setIsSavingSettingsUsername(false);
        return;
      }

      setProfile((prev: any) => ({ ...prev, username: clean }));
      toast.success(`Wallet TAG updated to @${clean}!`);
    } catch (err: any) {
      setSettingsUsernameError(err.message || "An error occurred");
    } finally {
      setIsSavingSettingsUsername(false);
    }
  };

  const getSecuritySettings = () => {
    if (!profile) return { pinSet: false, require_pin_view: false };
    if ('wallet_pin' in profile) {
      return {
        pinSet: !!profile.wallet_pin,
        require_pin_view: !!profile.require_pin_view
      };
    }
    try {
      if (profile.phone_number && profile.phone_number.startsWith('{')) {
        const parsed = JSON.parse(profile.phone_number);
        return {
          pinSet: !!parsed.pin,
          require_pin_view: !!parsed.require_pin_view
        };
      }
    } catch (e) {}
    return { pinSet: false, require_pin_view: false };
  };

  const { pinSet, require_pin_view } = getSecuritySettings();

  useEffect(() => {
    localStorage.setItem('plugsy_balance_visible', String(balanceVisible));
  }, [balanceVisible]);

  useEffect(() => {
    if (profile) {
      const { pinSet, require_pin_view: viewLocked } = getSecuritySettings();
      setViewRequirePin(viewLocked);
      // Only view lock if they have a PIN set and have require_pin_view enabled
      if (pinSet && viewLocked) {
        setIsViewLocked(true);
      } else {
        setIsViewLocked(false);
      }
    }
  }, [profile]);

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput || pinInput.length !== 4 || !/^\d+$/.test(pinInput)) {
      setPinChangeError('PIN must be exactly 4 digits.');
      return;
    }
    setIsSavingPin(true);
    setPinChangeError('');
    setPinChangeSuccess('');
    try {
      const res = await fetch('/api/wallet?action=set-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
          "Idempotency-Key": getStableIdempotencyKey("set-pin"),
        },
        body: JSON.stringify({
          pin: pinInput,
          require_pin_view: viewRequirePin
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      toast.success(data.message || 'Security PIN updated!');
      setPinChangeSuccess('PIN saved successfully!');
      setPinInput('');
      setTimeout(() => {
        setIsSettingsOpen(false);
        setPinChangeSuccess('');
      }, 1500);
      loadWalletData();
    } catch (err: any) {
      setPinChangeError(err.message || 'Failed to update PIN.');
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleUpdatePinSettings = async (requireView: boolean) => {
    setViewRequirePin(requireView);
    try {
      const res = await fetch('/api/wallet?action=update-pin-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
          "Idempotency-Key": getStableIdempotencyKey("pin-settings"),
        },
        body: JSON.stringify({
          require_pin_view: requireView
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Security preferences updated!');
      loadWalletData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update preferences.');
    }
  };

  const handleUnlockView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewUnlockPin || viewUnlockPin.length !== 4) {
      setViewUnlockError('PIN must be 4 digits.');
      return;
    }
    setIsVerifyingViewPin(true);
    setViewUnlockError('');

    try {
      const res = await fetch('/api/wallet?action=verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({
          pin: viewUnlockPin
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setIsViewLocked(false);
      setViewUnlockPin('');
      toast.success('Wallet unlocked!');
    } catch (err: any) {
      setViewUnlockError(err.message || 'Incorrect security PIN.');
    } finally {
      setIsVerifyingViewPin(false);
    }
  };

  const handleWithdrawClick = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || amount < 1000) {
      toast.error('Minimum withdrawal is ₦1,000');
      return;
    }
    if (balance < amount + FEE) {
      toast.error('Insufficient balance to cover withdrawal and fee');
      return;
    }

    if (!pinSet) {
      toast.error('Please configure a 4-digit security PIN in Wallet Settings before withdrawing.');
      setIsSettingsOpen(true);
      return;
    }

    setIsWithdrawAuthOpen(true);
    setWithdrawPin('');
    setWithdrawPinError('');
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawPin || withdrawPin.length !== 4) {
      setWithdrawPinError('PIN must be 4 digits.');
      return;
    }

    setIsWithdrawing(true);
    setWithdrawPinError('');
    try {
      const res = await fetch('/api/wallet?action=withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
          "Idempotency-Key": getStableIdempotencyKey("withdrawal"),
        },
        body: JSON.stringify({
          amount: Number(withdrawAmount),
          pin: withdrawPin
        })
      });
      const data = await res.json();
      if (!data.success) {
        if (data.refunded) {
          clearStableIdempotencyKey("withdrawal");
        }
        throw new Error(data.error);
      }

      clearStableIdempotencyKey("withdrawal");
      toast.success(data.message || 'Withdrawal initiated successfully!');
      setWithdrawAmount('');
      setWithdrawPin('');
      setIsWithdrawAuthOpen(false);
      setIsWithdrawModalOpen(false);
      loadWalletData();
    } catch (err: any) {
      setWithdrawPinError(err.message || 'Failed to initiate withdrawal');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const loadWalletData = async (background = false) => {
    if (!user?.id || walletLoadInFlightRef.current) return;
    walletLoadInFlightRef.current = true;
    if (!background) setLoading(true);
    setWalletError(null);
    if (!background) setWalletAvailability('loading');
    try {
      const fetchLinkedProfile = async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('clerk_id', user.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      };

      let profileData = await fetchLinkedProfile();
      if (!profileData) {
        setWalletAvailability('syncing');
        await syncClerkUserToSupabase(user, getToken);
        for (let attempt = 0; attempt < 2 && !profileData; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700));
          profileData = await fetchLinkedProfile();
        }
      }

      if (!profileData || profileData.clerk_id !== user.id) {
        throw new Error('PROFILE_NOT_CONFIRMED');
      }

      setProfile(profileData);
      setBalance(Number(profileData.balance ?? 0));

      const { data: txData, error: txError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (txError) throw txError;

      let currentTransactions = txData || [];
      setTransactions(currentTransactions);
      setWalletAvailability('ready');

      const recoveryKey = `plugsy_wallet_funding_recovery_${user.id}`;
      let recoveryAlreadyAttempted = false;
      try {
        recoveryAlreadyAttempted = sessionStorage.getItem(recoveryKey) === 'true';
      } catch {
        recoveryAlreadyAttempted = true;
      }

      const pendingReferences = currentTransactions
        .filter((transaction: any) => transaction.type === 'fund' && transaction.status === 'pending' && transaction.reference)
        .slice(0, 3)
        .map((transaction: any) => transaction.reference);

      if (!recoveryAlreadyAttempted && pendingReferences.length > 0) {
        try {
          const token = await getToken();
          let reconciled = false;
          if (token) {
            try {
              sessionStorage.setItem(recoveryKey, 'true');
            } catch {}
            for (const reference of pendingReferences) {
              const response = await fetch('/api/wallet?action=verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ reference }),
              });
              const result = await response.json().catch(() => null);
              if (response.ok && result?.success && result.pending === false) reconciled = true;
            }
          }

          if (reconciled) {
            const [freshProfile, freshTransactions] = await Promise.all([
              fetchLinkedProfile(),
              supabase
                .from('wallet_transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false }),
            ]);
            if (freshProfile?.clerk_id === user.id) {
              setProfile(freshProfile);
              setBalance(Number(freshProfile.balance ?? 0));
            }
            if (!freshTransactions.error) {
              currentTransactions = freshTransactions.data || [];
              setTransactions(currentTransactions);
            }
          }
        } catch {}
      }
    } catch {
      if (!background) {
        setProfile(null);
        setWalletAvailability('unavailable');
        setWalletError('Your wallet profile could not be confirmed. Your balance has not been loaded.');
      }
    } finally {
      if (!background) setLoading(false);
      walletLoadInFlightRef.current = false;
    }
  };

  useEffect(() => {
    setProfile(null);
    setTransactions([]);
    setWalletAvailability('loading');
    if (user?.id) void loadWalletData();
  }, [user?.id]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (user?.id) void loadWalletData(true);
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [user?.id]);

  const handleFundWallet = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isFunding) return;
    const amount = Number(fundAmount);
    
    if (!amount || amount < 100) {
      setFundError("Minimum funding amount is ₦100");
      return;
    }

    const userId = user?.id;
    const userEmail = user?.primaryEmailAddress?.emailAddress;

    if (!userId || !userEmail) {
      setFundError("User not loaded yet, please try again");
      return;
    }

    setIsFunding(true);
    setFundError(null);

    try {
      const token = await getToken();

      if (!token) {
        throw new Error(
          "Your session expired. Please sign in again.",
        );
      }

      const res = await fetch("/api/wallet?action=fund", { method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": getStableIdempotencyKey("wallet-funding"),
        },
        body: JSON.stringify({ amount }) });

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        setFundError("Server returned invalid response");
        setIsFunding(false);
        return;
      }


      if (data.code === "WALLET_FUNDING_TEMPORARILY_PAUSED") {
        setFundError(WALLET_FUNDING_PAUSED_MESSAGE);
        setIsFunding(false);
        return;
      }

      if (!data.success) {
        setFundError(data.error || "Failed to initialize payment");
        setIsFunding(false);
        return;
      }

      if (!data.authorization_url) {
        setFundError("Payment link missing — try again");
        setIsFunding(false);
        return;
      }

      window.location.href = data.authorization_url;

    } catch (e: any) {
      console.error("[fund] request failed");
      setFundError("Network error: " + e.message);
      setIsFunding(false);
    }
  };

  const handleSetUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = usernameInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    
    if (clean.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return;
    }

    const res = await fetch("/api/wallet?action=update-username", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getToken()}`,
        "Idempotency-Key": getStableIdempotencyKey("username"),
      },
      body: JSON.stringify({ 
        username: clean,
      })
    });
    const result = await res.json();

    if (!result.success) {
      setUsernameError(result.error || "Failed to update username");
      return;
    }

    setProfile((prev: any) => ({ ...prev, username: clean }));
    toast.success(`Username saved as @${clean}!`);
  };

  const handleDismissUsernamePrompt = () => {
    sessionStorage.setItem('plugsy_dismiss_username_prompt', 'true');
    setShowUsernameBanner(false);
  };

  const getRelativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "now";
    if (mins < 60) return mins + "m ago";
    if (hours < 24) return hours + "h ago";
    if (days < 7) return days + "d ago";
    return new Date(timestamp).toLocaleDateString();
  };

  if (loading) {
    if (walletAvailability === 'syncing') {
      return (
        <div className="min-h-screen py-24 px-6 flex items-center justify-center bg-brand-background">
          <div className="max-w-md w-full rounded-2xl border border-brand-border bg-brand-surface p-8 text-center">
            <Loader2 className="mx-auto mb-4 animate-spin text-brand-accent" size={40} />
            <h2 className="text-xl font-black text-brand-text-primary">Profile syncing</h2>
            <p className="mt-2 text-sm text-brand-text-secondary">Confirming your secure wallet profile before loading a balance.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen py-24 px-6 md:px-12 max-w-4xl mx-auto space-y-8 bg-brand-background">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="w-48 h-8 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
            <div className="w-64 h-4 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
        </div>

        {/* Balance card skeleton */}
        <div className="bg-white dark:bg-[#141416] border border-slate-150 dark:border-white/10 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl">
          <div className="space-y-2">
            <div className="w-24 h-4 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
            <div className="w-40 h-10 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-white/5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-white/10 animate-pulse" />
                <div className="w-12 h-3.5 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Transactions list skeleton */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-32 h-5 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
            <div className="w-16 h-4 bg-slate-200 dark:bg-white/5 animate-pulse rounded" />
          </div>

          <div className="bg-white dark:bg-[#141416] border border-slate-150 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-lg">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/10 animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="w-32 h-4 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
                    <div className="w-20 h-3 bg-slate-150 dark:bg-white/5 animate-pulse rounded" />
                  </div>
                </div>
                <div className="w-16 h-4 bg-slate-200 dark:bg-white/10 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (walletAvailability === 'unavailable' || !profile) {
    return (
      <div className="min-h-screen py-24 px-6 flex items-center justify-center bg-brand-background">
        <div className="max-w-md w-full rounded-2xl border border-red-500/20 bg-brand-surface p-8 text-center">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={40} />
          <h2 className="text-xl font-black text-brand-text-primary">Wallet unavailable</h2>
          <p className="mt-2 text-sm text-brand-text-secondary">{walletError || 'Your wallet profile could not be confirmed.'}</p>
          <button
            type="button"
            onClick={() => void loadWalletData()}
            className="mt-6 rounded-xl bg-brand-accent px-5 py-3 text-sm font-bold text-white active:scale-[0.98]"
          >
            Retry wallet sync
          </button>
        </div>
      </div>
    );
  }

  if (isViewLocked) {
    return (
      <div className="min-h-screen pt-24 pb-12 px-6 flex justify-center items-center bg-brand-background">
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-brand-text-primary mb-2">Wallet is Locked</h2>
          <p className="text-brand-text-secondary text-sm mb-6">
            Enter your 4-digit security PIN to access your wallet dashboard.
          </p>
          <form onSubmit={handleUnlockView} className="space-y-4">
            <div>
              <input
                type="password"
                maxLength={4}
                value={viewUnlockPin}
                onChange={(e) => setViewUnlockPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-32 tracking-[1.5em] pl-6 text-center bg-brand-background border border-brand-border rounded-xl py-3 text-xl font-bold text-brand-text-primary placeholder-brand-text-secondary/50 focus:outline-none focus:border-brand-accent transition-colors mx-auto block"
                required
                autoFocus
              />
            </div>
            {viewUnlockError && (
              <p className="text-red-500 text-xs font-semibold">{viewUnlockError}</p>
            )}
            <button
              type="submit"
              disabled={isVerifyingViewPin || viewUnlockPin.length !== 4}
              className="w-full bg-brand-accent hover:bg-brand-accent/90 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors cursor-pointer flex justify-center items-center gap-2"
            >
              {isVerifyingViewPin ? 'Unlocking...' : 'Unlock Wallet'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Filter logic for full history view
  const filteredTransactions = transactions.filter(tx => {
    const desc = (tx.description || '').toLowerCase();
    const type = (tx.type || '').toLowerCase();
    const matchesSearch = desc.includes(searchQuery.toLowerCase()) || type.includes(searchQuery.toLowerCase());
    
    if (filterType === 'all') return matchesSearch;
    if (filterType === 'credit') {
      return matchesSearch && (tx.type === 'fund' || tx.type === 'p2p_receive');
    }
    if (filterType === 'debit') {
      return matchesSearch && (tx.type === 'withdraw' || tx.type === 'p2p_send' || tx.type === 'purchase');
    }
    return matchesSearch;
  });

  // Render Full History View
  if (showHistoryOnly) {
    return (
      <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link 
            to="/wallet" 
            className="p-2 bg-brand-surface hover:bg-brand-text/5 border border-brand-border rounded-xl text-brand-text-primary transition-all flex items-center justify-center"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Transaction History</h1>
            <p className="text-xs text-brand-text-secondary">View and filter your transactions</p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
            <input
              type="text"
              placeholder="Search by description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-brand-background border border-brand-border rounded-xl py-2 pl-10 pr-4 text-xs font-semibold text-brand-text-primary placeholder-brand-text-secondary/50 focus:outline-none focus:border-brand-accent transition-colors"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`flex-1 sm:flex-initial px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${filterType === 'all' ? 'bg-brand-text text-brand-surface' : 'bg-brand-background text-brand-text-secondary hover:text-brand-text border border-brand-border'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('credit')}
              className={`flex-1 sm:flex-initial px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${filterType === 'credit' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-brand-background text-brand-text-secondary hover:text-brand-text border border-brand-border'}`}
            >
              Credits
            </button>
            <button
              onClick={() => setFilterType('debit')}
              className={`flex-1 sm:flex-initial px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${filterType === 'debit' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-brand-background text-brand-text-secondary hover:text-brand-text border border-brand-border'}`}
            >
              Debits
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-sm">
          {filteredTransactions.length === 0 ? (
            <div className="p-20 text-center text-brand-text-secondary uppercase font-black tracking-widest text-xs">
              No transactions found
            </div>
          ) : (
            <div className="divide-y divide-brand-border">
              {filteredTransactions.map((tx) => {
                const isCredit = tx.type === 'fund' || tx.type === 'p2p_receive';
                return (
                  <div key={tx.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-brand-background transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        tx.type === 'fund' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                        tx.type === 'p2p_receive' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        tx.type === 'withdraw' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                        tx.type === 'p2p_send' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' :
                        'bg-brand-text/5 text-brand-text-secondary border border-brand-border'
                      }`}>
                        {tx.type === 'fund' && <ArrowDownLeft size={18} />}
                        {tx.type === 'p2p_receive' && <ArrowDownLeft size={18} className="rotate-[90deg]" />}
                        {tx.type === 'withdraw' && <ArrowUpRight size={18} />}
                        {tx.type === 'p2p_send' && <ArrowUpRight size={18} className="rotate-[-45deg]" />}
                        {tx.type !== 'fund' && tx.type !== 'p2p_receive' && tx.type !== 'withdraw' && tx.type !== 'p2p_send' && <ShoppingCart size={18} />}
                      </div>
                      <div>
                        <p className="font-bold text-sm sm:text-base text-brand-text-primary capitalize">
                          {tx.description || (tx.type === 'fund' ? 'Wallet Top-up' : tx.type)}
                        </p>
                        <p className="text-[10px] font-mono text-brand-text-secondary mt-1 flex items-center gap-1.5 uppercase">
                          <span>{getRelativeTime(tx.created_at)}</span>
                          {tx.reference && (
                            <>
                              <span>•</span>
                              <span>Ref: {tx.reference}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className={`font-black text-sm sm:text-base ${isCredit ? 'text-green-500' : 'text-brand-text-primary'}`}>
                        {isCredit ? '+' : '-'}₦{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className={`inline-block py-0.5 px-2 rounded-md text-[9px] font-black uppercase tracking-wider mt-1.5 ${
                        tx.status === 'success' ? 'bg-green-500/10 text-green-500' :
                        tx.status === 'confirmed' ? 'bg-green-500/10 text-green-500' :
                        tx.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                        'bg-red-500/10 text-red-500'
                      }`}>
                        {tx.type === 'withdraw' && (tx.status === 'success' || tx.status === 'confirmed') ? 'Sent' : tx.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Dashboard View
  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto space-y-6">
      
      {/* 1. TOP BAR */}
      <div className="flex items-center justify-between pb-3 border-b border-brand-border/60">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">
            Wallet TAG
          </span>
          {profile?.username ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-sm font-black text-brand-accent">
                @{profile.username}
              </span>
              <button
                onClick={handleCopyTag}
                className="p-1 rounded-md bg-brand-text/5 hover:bg-brand-text/10 text-brand-text-secondary hover:text-brand-text transition-all flex items-center justify-center gap-1 cursor-pointer"
                title="Copy Wallet TAG"
              >
                {copied ? (
                  <Check size={12} className="text-green-500 stroke-[3px]" />
                ) : (
                  <Copy size={12} />
                )}
                <span className="text-[9px] font-bold uppercase tracking-wider px-0.5">Copy</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="text-xs font-bold text-brand-text-secondary hover:text-brand-accent mt-0.5 text-left flex items-center gap-1"
            >
              <span>No TAG configured — click here to set one</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 bg-brand-surface hover:bg-brand-text/5 border border-brand-border rounded-xl text-brand-text-secondary hover:text-brand-text transition-all"
            title="Wallet Security Settings"
          >
            <Settings size={18} />
          </button>
          <Link 
            to="/support"
            className="p-2.5 bg-brand-surface hover:bg-brand-text/5 border border-brand-border rounded-xl text-brand-text-secondary hover:text-brand-text transition-all"
            title="Help & Support"
          >
            <HelpCircle size={18} />
          </Link>
        </div>
      </div>

      {/* PART 5: USERNAME SETUP PROMPT */}
      {!profile?.username && showUsernameBanner && (
        <div className="bg-brand-surface border border-brand-accent/20 rounded-2xl p-4 relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
          <button 
            onClick={handleDismissUsernamePrompt}
            className="absolute top-3 right-3 text-brand-text-secondary hover:text-brand-text"
          >
            <X size={16} />
          </button>
          <div className="space-y-1 max-w-md">
            <h4 className="text-xs font-bold text-brand-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-brand-accent" />
              Claim your unique username
            </h4>
            <p className="text-xs text-brand-text-secondary">
              Set your @username to receive seamless, instant wallet transfers from other Plugsy users.
            </p>
          </div>
          <form onSubmit={handleSetUsername} className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary text-xs font-bold">@</span>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="username"
                className="w-full sm:w-36 bg-brand-background border border-brand-border rounded-xl py-2 pl-6 pr-3 text-xs font-semibold text-brand-text-primary focus:outline-none focus:border-brand-accent"
                required
              />
            </div>
            <button
              type="submit"
              className="bg-brand-accent hover:bg-brand-accent/95 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shrink-0"
            >
              Save
            </button>
          </form>
          {usernameError && (
            <p className="absolute bottom-1 left-4 text-[10px] text-red-500 font-semibold">{usernameError}</p>
          )}
        </div>
      )}

      {/* 2. BALANCE CARD (Hero element with green-to-dark gradient) */}
      <div 
        className="rounded-3xl p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #16a34a 0%, #0d8a3f 100%)' }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-black/10 rounded-full blur-xl pointer-events-none" />

        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1.5 z-10">
            <div className="flex items-center gap-2 text-white/80">
              <ShieldCheck size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Available Balance</span>
              <button 
                onClick={() => setBalanceVisible(!balanceVisible)}
                className="text-white/80 hover:text-white transition-colors"
                title={balanceVisible ? "Hide balance" : "Show balance"}
              >
                {balanceVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight drop-shadow-xs">
              {balanceVisible ? (
                `₦${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                '••••••••'
              )}
            </h2>
          </div>

          <Link 
            to="/wallet/history" 
            className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-white/15 hover:bg-white/20 active:bg-white/35 text-white px-3 py-2 rounded-xl backdrop-blur-xs flex items-center gap-1.5 transition-all cursor-pointer z-10 shrink-0"
          >
            <span>History</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        <div className="mt-8 flex justify-between items-center z-10 border-t border-white/10 pt-4">
          <p className="text-[10px] text-white/70 font-mono tracking-wider">
            PLUGSY PAY SECURE
          </p>
          <button
            onClick={() => setIsFundModalOpen(true)}
            className="bg-white hover:bg-white/95 text-emerald-800 text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1"
          >
            <Plus size={14} className="stroke-[3px]" />
            Add Money
          </button>
        </div>
      </div>

      {/* 3. ACTION ROW (OPay Style equal-width dark buttons box) */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-xs grid grid-cols-3 gap-2">
        <button
          onClick={() => {
            if (!profile?.username) {
              toast.error("Please set a username above first before sending transfers.");
              return;
            }
            setIsSendModalOpen(true);
          }}
          className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-brand-text/5 transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 group-hover:scale-105 group-active:scale-95 text-brand-accent flex items-center justify-center transition-all mb-2 shadow-xs">
            <Send size={20} className="rotate-[-45deg] stroke-[2.5px]" />
          </div>
          <span className="text-xs font-bold text-brand-text-primary">To Plugsy</span>
          <span className="text-[9px] text-brand-text-secondary mt-0.5">Free Transfer</span>
        </button>

        <button
          onClick={() => {
            if (!hasWithdrawalBankAccount) {
              setIsBankModalOpen(true);
              toast.error("Please set up your bank account details first.");
              return;
            }
            setIsWithdrawModalOpen(true);
          }}
          className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-brand-text/5 transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-105 group-active:scale-95 text-emerald-500 flex items-center justify-center transition-all mb-2 shadow-xs">
            <Building size={20} className="stroke-[2.5px]" />
          </div>
          <span className="text-xs font-bold text-brand-text-primary">To Bank</span>
          <span className="text-[9px] text-brand-text-secondary mt-0.5">Withdraw</span>
        </button>

        <button
          onClick={() => setIsFundModalOpen(true)}
          className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-brand-text/5 transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 group-hover:scale-105 group-active:scale-95 text-amber-500 flex items-center justify-center transition-all mb-2 shadow-xs">
            <Plus size={22} className="stroke-[2.5px]" />
          </div>
          <span className="text-xs font-bold text-brand-text-primary">Add Money</span>
          <span className="text-[9px] text-brand-text-secondary mt-0.5">Via Flutterwave</span>
        </button>
      </div>

      {/* 4. BANK STATUS BANNER (If bank not set up) */}
      {!hasWithdrawalBankAccount && showBankBanner && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4.5 flex items-center justify-between gap-4 text-xs shadow-xs animate-in slide-in-from-top duration-300">
          <div className="flex items-start gap-3">
            <Building2 className="text-amber-500 shrink-0 mt-0.5" size={18} />
            <div className="space-y-0.5">
              <span className="font-bold block text-brand-text-primary">Link your Bank Account</span>
              <span className="text-brand-text-secondary text-[11px] block">
                Required for withdrawing earnings from your balance instantly to any Nigerian bank.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsBankModalOpen(true)}
              className="bg-brand-text text-brand-surface hover:opacity-90 px-3.5 py-1.5 rounded-xl font-black uppercase text-[10px] transition-all cursor-pointer"
            >
              Link Now
            </button>
            <button 
              onClick={() => setShowBankBanner(false)} 
              className="text-brand-text-secondary hover:text-brand-text p-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 5. TRANSACTION HISTORY (Recent Activity) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-brand-text-secondary flex items-center gap-2">
            <History size={16} />
            Recent Activity
          </h3>
          <Link 
            to="/wallet/history" 
            className="text-xs font-bold text-brand-accent hover:underline flex items-center gap-0.5"
          >
            <span>See all</span>
            <ChevronRight size={14} />
          </Link>
        </div>
        
        <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-xs">
          {transactions.length === 0 ? (
            <div className="p-12 text-center text-brand-text-secondary uppercase font-black tracking-widest text-[11px]">
              No transactions yet
            </div>
          ) : (
            <div className="divide-y divide-brand-border">
              {transactions.slice(0, 20).map((tx) => {
                const isCredit = tx.type === 'fund' || tx.type === 'p2p_receive';
                return (
                  <div key={tx.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-brand-background/40 transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        tx.type === 'fund' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                        tx.type === 'p2p_receive' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        tx.type === 'withdraw' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                        tx.type === 'p2p_send' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' :
                        'bg-brand-text/5 text-brand-text-secondary border border-brand-border'
                      }`}>
                        {tx.type === 'fund' && <ArrowDownLeft size={18} />}
                        {tx.type === 'p2p_receive' && <ArrowDownLeft size={18} className="rotate-[90deg]" />}
                        {tx.type === 'withdraw' && <ArrowUpRight size={18} />}
                        {tx.type === 'p2p_send' && <ArrowUpRight size={18} className="rotate-[-45deg]" />}
                        {tx.type !== 'fund' && tx.type !== 'p2p_receive' && tx.type !== 'withdraw' && tx.type !== 'p2p_send' && <ShoppingCart size={18} />}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-brand-text-primary capitalize">
                          {tx.description || (tx.type === 'fund' ? 'Wallet Top-up' : tx.type)}
                        </p>
                        <p className="text-[10px] text-brand-text-secondary mt-0.5">
                          {getRelativeTime(tx.created_at)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className={`font-black text-sm sm:text-base ${isCredit ? 'text-green-500' : 'text-brand-text-primary'}`}>
                        {isCredit ? '+' : '-'}₦{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className={`inline-block py-0.5 px-2 rounded-md text-[9px] font-black uppercase tracking-wider mt-1 ${
                        tx.status === 'success' ? 'bg-green-500/10 text-green-500' :
                        tx.status === 'confirmed' ? 'bg-green-500/10 text-green-500' :
                        tx.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                        'bg-red-500/10 text-red-500'
                      }`}>
                        {tx.type === 'withdraw' && (tx.status === 'success' || tx.status === 'confirmed') ? 'Sent' : tx.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* P2P SEND MONEY MODAL */}
      <SendMoneyModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        balance={balance}
        senderId={user?.id || ''}
        senderEmail={user?.primaryEmailAddress?.emailAddress || ''}
        onSuccess={loadWalletData}
        onOpenFunding={() => setIsFundModalOpen(true)}
      />

      {/* FUND WALLET MODAL */}
      {isFundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
          <div className="absolute inset-0" onClick={() => setIsFundModalOpen(false)} />
          <div className="relative w-full max-w-md bg-brand-surface border border-brand-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 p-6 space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-brand-border">
              <h3 className="text-base font-black uppercase tracking-widest text-brand-text-primary">Fund Wallet</h3>
              <button onClick={() => setIsFundModalOpen(false)} className="text-brand-text-secondary hover:text-brand-text">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFundWallet} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary block mb-2">Amount (₦)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary font-bold">₦</span>
                  <input
                    type="number"
                    min="100"
                    step="any"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-brand-background border border-brand-border rounded-xl py-3 pl-8 pr-4 text-brand-text-primary focus:outline-none focus:border-brand-accent font-semibold"
                    required
                  />
                </div>
                <p className="text-[10px] text-brand-text-secondary mt-1.5 pl-1">Minimum deposit is ₦100</p>
              </div>

              {fundError && (
                <p className="text-xs font-semibold text-red-500 bg-red-500/5 p-3 rounded-lg text-center">
                  {fundError}
                </p>
              )}

              <button
                type="submit"
                disabled={isFunding || !fundAmount}
                className="w-full bg-brand-accent hover:bg-brand-accent/95 disabled:opacity-50 text-white font-black uppercase tracking-wider text-xs py-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isFunding ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Processing...
                  </>
                ) : (
                  'Continue to Flutterwave'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* WITHDRAW TO BANK MODAL */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
          <div className="absolute inset-0" onClick={() => setIsWithdrawModalOpen(false)} />
          <div className="relative w-full max-w-md bg-brand-surface border border-brand-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 p-6 space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-brand-border">
              <h3 className="text-base font-black uppercase tracking-widest text-brand-text-primary">Withdraw Funds</h3>
              <button onClick={() => setIsWithdrawModalOpen(false)} className="text-brand-text-secondary hover:text-brand-text">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleWithdrawClick} className="space-y-4">
              {hasWithdrawalBankAccount && (
                <div className="bg-brand-text/5 border border-brand-border rounded-xl p-3.5 flex items-center gap-3">
                  <Building2 size={18} className="text-brand-accent" />
                  <div className="text-xs">
                    <p className="font-bold text-brand-text-primary">{profile.bank_name}</p>
                    <p className="text-brand-text-secondary mt-0.5">{profile.account_number} • {profile.account_name}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary block mb-2">Amount to Withdraw</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary font-bold">₦</span>
                  <input
                    type="number"
                    min="1000"
                    step="any"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-brand-background border border-brand-border rounded-xl py-3 pl-8 pr-4 text-brand-text-primary focus:outline-none focus:border-brand-accent font-semibold"
                    required
                  />
                </div>
                
                {Number(withdrawAmount) > 0 && (
                  <div className="mt-4 bg-brand-text/[0.02] border border-brand-border/60 rounded-xl p-4 space-y-2 text-xs">
                    <div className="flex justify-between text-brand-text-secondary">
                      <span>Amount</span>
                      <span>₦{(Number(withdrawAmount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-brand-text-secondary">
                      <span>Withdrawal Fee</span>
                      <span>₦{FEE.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-black text-brand-text-primary pt-2.5 border-t border-brand-border">
                      <span>Total Deduction</span>
                      <span className="text-red-500">
                        ₦{(Number(withdrawAmount) + FEE).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isWithdrawing || !withdrawAmount || !hasWithdrawalBankAccount}
                className="w-full bg-brand-accent hover:bg-brand-accent/95 disabled:opacity-50 text-white font-black uppercase tracking-wider text-xs py-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isWithdrawing ? 'Processing...' : 'Authorize withdrawal'}
              </button>

              {!hasWithdrawalBankAccount && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1 justify-center">
                  <AlertCircle size={12} /> Add bank account details first
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* BANK ACCOUNT SETTINGS MODAL */}
      {isBankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
          <div className="absolute inset-0" onClick={() => setIsBankModalOpen(false)} />
          <div className="relative w-full max-w-md bg-brand-surface border border-brand-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 p-6 space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-brand-border">
              <h3 className="text-base font-black uppercase tracking-widest text-brand-text-primary">Bank Account Setup</h3>
              <button onClick={() => setIsBankModalOpen(false)} className="text-brand-text-secondary hover:text-brand-text">
                <X size={20} />
              </button>
            </div>
            
            <BankAccountForm
              userId={user?.id || ""}
              userEmail={user?.primaryEmailAddress?.emailAddress || ""}
              currentBank={
                profile?.account_number
                  ? {
                      bank_name: profile.bank_name,
                      account_number: profile.account_number,
                      account_name: profile.account_name
                    }
                  : null
              }
              onSaved={() => {
                loadWalletData();
                setIsBankModalOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* WALLET SECURITY SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 px-4">
          <div className="bg-brand-surface border border-brand-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-brand-text-secondary hover:text-brand-text"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-brand-text-primary mb-2 flex items-center gap-2">
              <Settings className="text-brand-accent" size={20} />
              <span>Wallet Settings</span>
            </h3>
            <p className="text-xs text-brand-text-secondary mb-6">
              Configure your unique wallet Tag and secure your account transfers and withdrawals.
            </p>

            <div className="space-y-6">
              {/* SECTION 1: WALLET TAG */}
              <form onSubmit={handleSaveSettingsUsername} className="space-y-4 pb-6 border-b border-brand-border">
                <h4 className="text-xs font-black uppercase tracking-wider text-brand-text-secondary flex items-center gap-1.5">
                  <QrCode size={14} className="text-brand-accent" />
                  Wallet TAG Setup
                </h4>
                <p className="text-[11px] text-brand-text-secondary">
                  Your TAG allows other Plugsy creators to send you instant fee-free peer-to-peer transfers.
                </p>
                
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary text-sm font-bold">@</span>
                    <input
                      type="text"
                      value={settingsUsernameInput}
                      onChange={(e) => setSettingsUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      placeholder="tag"
                      className="w-full bg-brand-background border border-brand-border rounded-xl py-2.5 pl-8 pr-4 text-sm font-semibold text-brand-text-primary focus:outline-none focus:border-brand-accent transition-colors"
                    />
                  </div>
                  {settingsUsernameError && (
                    <p className="text-red-500 text-[10px] font-semibold">{settingsUsernameError}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingSettingsUsername || !settingsUsernameInput}
                    className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
                  >
                    {isSavingSettingsUsername ? 'Updating...' : 'Update Tag'}
                  </button>
                </div>
              </form>

              {/* SECTION 2: SECURITY PIN */}
              <form onSubmit={handleSavePin} className="space-y-6">
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-text-secondary flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-brand-accent" />
                    Security PIN Configuration
                  </h4>
                  <p className="text-[11px] text-brand-text-secondary">
                    {pinSet ? 'Update your 4-digit security PIN used to confirm transactions.' : 'Set up a new 4-digit security PIN to secure your wallet transactions.'}
                  </p>
                  <div className="flex justify-center pt-2">
                    <input
                      type="password"
                      maxLength={4}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-32 tracking-[1.5em] pl-6 text-center bg-brand-background border border-brand-border rounded-xl py-2.5 text-lg font-bold text-brand-text-primary placeholder-brand-text-secondary/50 focus:outline-none focus:border-brand-accent transition-colors"
                      required={!pinSet}
                    />
                  </div>
                  <p className="text-[10px] text-brand-text-secondary text-center mt-1">
                    {pinSet ? 'Leave empty if you only want to change PIN requirement settings below.' : 'PIN must be exactly 4 digits.'}
                  </p>
                </div>

                <div className="border-t border-brand-border pt-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={viewRequirePin}
                      onChange={(e) => handleUpdatePinSettings(e.target.checked)}
                      className="rounded border-brand-border text-brand-accent bg-brand-background focus:ring-brand-accent w-4 h-4"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-brand-text-primary">Require PIN to open Wallet</span>
                      <span className="text-[11px] text-brand-text-secondary">Requires verification before viewing balance/history</span>
                    </div>
                  </label>
                </div>

                {pinChangeError && (
                  <p className="text-red-500 text-xs font-semibold">{pinChangeError}</p>
                )}
                {pinChangeSuccess && (
                  <p className="text-green-500 text-xs font-semibold">{pinChangeSuccess}</p>
                )}

                <div className="flex gap-3 border-t border-brand-border pt-4 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2 border border-brand-border text-brand-text-primary hover:bg-brand-background rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPin || (pinInput.length !== 4 && pinInput.length !== 0)}
                    className="px-5 py-2 bg-brand-accent hover:bg-brand-accent/90 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    {isSavingPin ? 'Saving...' : 'Save Security PIN'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAWAL PIN AUTHORIZATION PROMPT */}
      {isWithdrawAuthOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 px-4">
          <div className="bg-brand-surface border border-brand-border rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center">
            <div className="w-12 h-12 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent mx-auto mb-4">
              <Lock size={22} />
            </div>
            <h3 className="text-lg font-bold text-brand-text-primary mb-1">Confirm Withdrawal PIN</h3>
            <p className="text-xs text-brand-text-secondary mb-6">
              Please enter your 4-digit Security PIN to authorize withdrawal of ₦{Number(withdrawAmount).toLocaleString()} (plus ₦{FEE} fee).
            </p>

            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div className="flex justify-center">
                <input
                  type="password"
                  maxLength={4}
                  value={withdrawPin}
                  onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-32 tracking-[1.5em] pl-6 text-center bg-brand-background border border-brand-border rounded-xl py-2.5 text-lg font-bold text-brand-text-primary placeholder-brand-text-secondary/50 focus:outline-none focus:border-brand-accent transition-colors mx-auto block"
                  required
                  autoFocus
                />
              </div>

              {withdrawPinError && (
                <p className="text-red-500 text-xs font-semibold">{withdrawPinError}</p>
              )}

              <div className="flex gap-3 border-t border-brand-border pt-4 justify-center">
                <button
                  type="button"
                  onClick={() => setIsWithdrawAuthOpen(false)}
                  className="px-4 py-2 border border-brand-border text-brand-text-primary hover:bg-brand-background rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWithdrawing || withdrawPin.length !== 4}
                  className="px-5 py-2 bg-brand-accent hover:bg-brand-accent/90 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  {isWithdrawing ? 'Authorizing...' : 'Authorize Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
