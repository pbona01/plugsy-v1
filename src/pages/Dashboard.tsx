import { LiquidGlass } from "../components/ui/LiquidGlass";
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { UserMedalsDisplay } from "../components/UserMedalsDisplay";
import toast from 'react-hot-toast';
import { getOneSignalPlayerId, requestOneSignalPermission, checkOneSignalSubscribed } from '../lib/oneSignal';
import { compressAndUpload } from "../utils/uploadMedia";
import { 
  ShoppingBag, Folder, Wallet as WalletIcon, MessageCircle, HelpCircle, 
  Gift, Award, MoreHorizontal, X, Camera, Loader2, Users, Link2 
} from 'lucide-react';
import { useOnlinePresence } from "../contexts/OnlinePresenceContext";
import {
  parseOneLinkProfileBio,
} from "../../shared/onelink.js";

export default function Dashboard() {
  const { userId, getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const { unreadCount } = useUnreadMessages();
  const { isUserOnline } = useOnlinePresence();
  
  const { profile: hookProfile, loading: profileLoading } = useProfile(userId || undefined);
  const [localProfile, setLocalProfile] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [siteSettings, setSiteSettings] = useState<any>(null);
  
  // Modals & Menu Overlay
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'refer' | 'profile'>('profile');

  // Profile Settings States
  const [profilePic, setProfilePic] = useState<string>('');
  const [profileUsername, setProfileUsername] = useState<string>('');
  const [profileBio, setProfileBio] = useState<string>('');
  const [profileFullName, setProfileFullName] = useState<string>('');
  const [profilePicUploading, setProfilePicUploading] = useState<boolean>(false);
  const [usernameErr, setUsernameErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [activeMedal, setActiveMedal] = useState<any>(null);
  const [medalNumber, setMedalNumber] = useState<number | null>(null);

  useEffect(() => {
    if (hookProfile) {
      setProfilePic(hookProfile.profile_pic_url || hookProfile.image_url || '');
      setProfileUsername(hookProfile.username || user?.username || '');
      setProfileBio(
        parseOneLinkProfileBio(hookProfile.bio).biography,
      );
      setProfileFullName(hookProfile.full_name || '');
    }
  }, [hookProfile, user]);

  useEffect(() => {
    if (isMoreOpen) {
      document.body.classList.add('dashboard-modal-open');
    } else {
      document.body.classList.remove('dashboard-modal-open');
    }
    
    window.dispatchEvent(new CustomEvent('dashboard-modal', { detail: { open: isMoreOpen } }));
    
    return () => {
      document.body.classList.remove('dashboard-modal-open');
      window.dispatchEvent(new CustomEvent('dashboard-modal', { detail: { open: false } }));
    };
  }, [isMoreOpen]);
  
  const [profileStats, setProfileStats] = useState({
    balance: 0,
    total_referral_earnings: 0,
    referral_count: 0
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentProfile = localProfile || hookProfile;
  const greetingName = currentProfile?.fullName?.split(' ')[0] || user?.firstName || 'Chief';
  const purchaseCode = currentProfile?.purchase_code || '...';

  // Fetch Referral Stats
  const fetchReferralStats = async () => {
    if (!userId) return;
    setStatsLoading(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance, total_referral_earnings, referral_count")
        .eq("clerk_id", userId)
        .single();
      
      if (profile) {
        setProfileStats({
          balance: profile.balance || 0,
          total_referral_earnings: profile.total_referral_earnings || 0,
          referral_count: profile.referral_count || 0
        });
      }
    } catch (e) {
      console.warn("Failed referral fetch:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(purchaseCode);
    setCopied(true);
    toast.success("Purchase code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchDashboardData = async () => {
    if (!userId) return;
    try {
      const userEmail = user?.primaryEmailAddress?.emailAddress;
      let queryStr = `user_id.eq.${userId}`;
      if (userEmail) {
        queryStr += `,user_email.eq.${userEmail}`;
      }

      const [subRes, orderRes, settingsRes, profileRes] = await Promise.all([
        supabase.from('subscriptions').select('*').eq('user_id', userId).eq('status', 'active'),
        supabase.from('orders').select('*').or(queryStr).in('status', ['paid', 'confirmed', 'completed', 'success', 'active', 'pending']).order('created_at', { ascending: false }),
        supabase.from('site_settings').select(),
        supabase.from('profiles').select().eq('clerk_id', userId).maybeSingle()
      ]);

      if (profileRes.data) {
        setLocalProfile(profileRes.data);
      }

      const subData = subRes.data || [];
      const orderData = orderRes.data || [];
      const allSettings = settingsRes.data || [];

      const activeOrdersAsSubs = orderData
        .filter((o: any) => o.status === 'completed' && o.delivery_status === 'login_sent')
        .map((o: any) => ({
          id: o.id,
          product_name: o.product_name || 'Premium Plan',
          plan_duration: o.plan_duration || `${o.plan_months || 1} Month(s)`,
          ends_at: o.subscription_expires_at || null,
          started_at: o.subscription_started_at || null,
          status: 'active'
        }));

      setSubscriptions([...subData, ...activeOrdersAsSubs]);
      setOrders(orderData.filter((o: any) => !(o.status === 'completed' && o.delivery_status === 'login_sent') && o.delivery_status !== 'delivered' && o.delivery_status !== 'sent'));

      try {
        const res = await fetch(`/api/payments?action=get-medal-status&userId=${userId}`);
        const medalData = await res.json();
        if (medalData?.success && medalData?.medal) {
          setActiveMedal(medalData.medal);
          setMedalNumber(medalData.medalNumber);
        }
      } catch (mErr) {
        console.warn("Error fetching active medal in dashboard:", mErr);
      }

      if (allSettings.length > 0) {
        const isKeyVal = 'setting_key' in allSettings[0];
        if (isKeyVal) {
          const settingsObj = allSettings.reduce((acc: any, item: any) => {
            acc[item.setting_key] = item.setting_value;
            return acc;
          }, {});
          setSiteSettings(settingsObj);
        } else {
          setSiteSettings(allSettings[0]);
        }
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  };

  useEffect(() => {
    if (!userId) return;
    fetchDashboardData();
    fetchReferralStats();
  }, [userId]);

  // Quick Action Config
  const launchpadItems = [
    {
      id: 'orders',
      label: 'Orders',
      icon: ShoppingBag,
      route: '/orders',
      ariaLabel: 'Manage active and pending orders',
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: Folder,
      route: '/portfolio',
      ariaLabel: 'Access custom portfolio items',
    },
    {
      id: 'wallet',
      label: 'Wallet',
      icon: WalletIcon,
      route: '/wallet',
      ariaLabel: 'Access your wallet to fund and withdraw',
    },
    {
      id: 'onelink',
      label: 'OneLink',
      icon: Link2,
      route: '/onelink',
      ariaLabel: 'Manage your independent promotional micro-site',
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageCircle,
      route: '/chats',
      ariaLabel: 'Chat with other users and communities',
    },
    {
      id: 'support',
      label: 'Support',
      icon: HelpCircle,
      route: '/chat',
      ariaLabel: 'Get assistance from support',
    },
    {
      id: 'products',
      label: 'Products',
      icon: Gift,
      route: '/products',
      ariaLabel: 'Explore available creative service plans',
    },
    {
      id: 'refer',
      label: 'Refer',
      icon: Users,
      route: '/refer',
      ariaLabel: 'Toggle reward settings and earn commissions',
      action: () => {
        setActiveTab('refer');
        setIsMoreOpen(true);
      }
    },
    {
      id: 'medals',
      label: 'Medals',
      icon: Award,
      route: '/medals',
      ariaLabel: 'Access exclusive premium discount medals',
    },
    {
      id: 'more',
      label: 'More',
      icon: MoreHorizontal,
      route: '/more',
      ariaLabel: 'Open system setup and subscription controls',
      action: () => {
        setActiveTab('notifications');
        setIsMoreOpen(true);
      }
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] text-slate-900 dark:text-white flex flex-col pt-12 md:pt-24 pb-32"
    >
      <div className="w-full max-w-[480px] mx-auto px-4 flex-grow flex flex-col justify-start">
        
        {/* Subtle Greeting */}
        <div className="pt-6 px-4 pb-4 select-none text-left flex justify-between items-center">
          <div>
            <h1 className="text-xl font-medium tracking-tight text-slate-950 dark:text-white mb-0.5">
              Hey, {greetingName}
            </h1>
            <p className="text-sm text-slate-500 dark:text-[#a1a1a1] font-light">
              What would you like to do?
            </p>
          </div>
          {activeMedal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => navigate('/medals')}
              className={`cursor-pointer text-[10px] font-mono font-black uppercase tracking-wider px-2.5 py-1.5 rounded-xl border flex items-center gap-1 shadow-md transition-all active:scale-95 ${
                activeMedal.name.includes("Gold") ? "bg-amber-400/10 text-amber-600 dark:text-amber-500 border-amber-400/20" :
                activeMedal.name.includes("Silver") ? "bg-zinc-400/10 text-zinc-500 dark:text-zinc-400 border-zinc-350/25" :
                "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25"
              }`}
            >
              <Award size={12} className="shrink-0 animate-pulse" />
              <span>#{medalNumber?.toString().padStart(3, "0")}</span>
            </motion.div>
          )}
        </div>

        {/* Quick Access Grid (2 rows x 3 columns) */}
        <div className="grid grid-cols-3 gap-3 p-4 shrink-0">
          {launchpadItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="flex flex-col items-center justify-center cursor-pointer select-none"
                onClick={() => {
                  if (item.action) {
                    item.action();
                  } else {
                    navigate(item.route);
                  }
                }}
              >
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  aria-label={item.ariaLabel}
                  className="w-16 h-16 rounded-[20px] bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/5 flex items-center justify-center text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#3b82f6]/50 shadow-md dark:shadow-lg relative"
                >
                  <Icon size={24} strokeWidth={1.8} />
                  {item.id === 'support' && unreadCount > 0 && (
                    <span 
                      id="chat-unread-badge"
                      className={`absolute -top-1 -right-1 rounded-full bg-blue-600 border-2 border-white dark:border-[#1a1a1a] text-white flex items-center justify-center font-black shadow-[0_4px_12px_rgba(37,99,235,0.5)] animate-pulse ${
                        unreadCount < 10 ? 'w-5 h-5 text-[10px]' : 'min-w-6 h-5 px-1.5 text-[10px]'
                      }`}
                      style={{ zIndex: 10 }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </motion.button>
                <span className="text-[12px] font-medium text-slate-700 dark:text-white/90 mt-2 text-center pointer-events-none">
                  {item.label}
                </span>
              </motion.div>
            );
          })}
        </div>



      </div>

      {/* Slide-Up Bottom Sheet Drawer holding More Settings, Referrals and withdrawals */}
      <AnimatePresence>
        {isMoreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMoreOpen(false)}
              className="fixed inset-0 bg-black z-50 pointer-events-auto"
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              className="fixed bottom-0 inset-x-0 bg-white dark:bg-[#161616] border-t border-slate-200 dark:border-white/10 rounded-t-[32px] z-50 px-4 pb-safe pointer-events-auto max-h-[85vh] overflow-y-auto flex flex-col shadow-2xl"
            >
              <div className="w-12 h-1 bg-slate-300 dark:bg-white/20 rounded-full mx-auto mt-3.5 mb-5 shrink-0" />
              
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white mb-0">Launchpad Settings</h3>
                <button 
                  onClick={() => setIsMoreOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Segmented Controller Tab Headers */}
              <div className="grid grid-cols-3 bg-slate-100 dark:bg-black/40 p-1 rounded-xl mb-4 text-xs font-bold shrink-0">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`py-2 rounded-lg transition-all ${activeTab === 'profile' ? 'bg-[#3b82f6] text-white shadow' : 'text-slate-500 hover:text-slate-900 dark:text-[#a1a1a1] dark:hover:text-white'}`}
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    setActiveTab('refer');
                    fetchReferralStats();
                  }}
                  className={`py-2 rounded-lg transition-all ${activeTab === 'refer' ? 'bg-[#3b82f6] text-white shadow' : 'text-slate-500 hover:text-slate-900 dark:text-[#a1a1a1] dark:hover:text-white'}`}
                >
                  Referrals
                </button>
                <button
                  onClick={() => setActiveTab('notifications')}
                  className={`py-2 rounded-lg transition-all ${activeTab === 'notifications' ? 'bg-[#3b82f6] text-white shadow' : 'text-slate-500 hover:text-slate-900 dark:text-[#a1a1a1] dark:hover:text-white'}`}
                >
                  Alerts
                </button>
              </div>

              {/* Tab Contents */}
              <div className="flex-grow overflow-y-auto pb-10">
                {activeTab === 'profile' && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-left">
                    <div className="bg-slate-50 dark:bg-[#242424] p-5 rounded-2xl border border-slate-200 dark:border-white/5 space-y-4">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="relative w-24 h-24 shrink-0">
                          <div className="relative group cursor-pointer w-full h-full rounded-full overflow-hidden border border-slate-300 dark:border-white/20">
                            {profilePic ? (
                              <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-slate-200 dark:bg-black/30 flex items-center justify-center text-slate-500">
                                <Camera size={24} />
                              </div>
                            )}
                            <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all cursor-pointer">
                              <Camera size={18} className="text-white" />
                              <span className="text-[9px] text-white font-bold uppercase tracking-wider mt-1">Change</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={profilePicUploading}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setProfilePicUploading(true);
                                  try {
                                    const url = await compressAndUpload(file);
                                    setProfilePic(url);
                                    toast.success("Picture uploaded successfully!");
                                  } catch (err: any) {
                                    toast.error(err.message || "Failed to upload picture");
                                  } finally {
                                    setProfilePicUploading(false);
                                  }
                                }}
                              />
                            </label>
                            {profilePicUploading && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                              </div>
                            )}
                          </div>
                          {isUserOnline(currentProfile?.clerk_id, currentProfile?.last_login_at) && (
                            <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-[3px] border-white dark:border-[#242424] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)] z-10 flex items-center justify-center pointer-events-none">
                              <span className="absolute w-full h-full bg-emerald-400 rounded-full animate-ping opacity-75"></span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tap to change image</span>
                      </div>

                      <div className="space-y-3">
                        <UserMedalsDisplay />

                        <div>
                          <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-white/40 tracking-wider mb-1">Full Name</label>
                          <input
                            type="text"
                            value={profileFullName}
                            onChange={(e) => setProfileFullName(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-slate-900 dark:text-white text-sm"
                            placeholder="John Doe"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-white/40 tracking-wider">Chat username</label>
                            <span className="text-[9px] bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/40 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Chat</span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 dark:text-white/30 text-sm font-semibold">@</span>
                            <input
                              type="text"
                              value={profileUsername}
                              disabled
                              className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/40 text-sm cursor-not-allowed font-medium"
                            />
                          </div>
                          <p className="text-[9px] text-slate-400 dark:text-white/30 font-medium mt-1">
                            Manage this in Chat Settings. Wallet TAG and One Link handle are separate.
                          </p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-white/40 tracking-wider">Bio</label>
                            <span className="text-[10px] text-slate-400 dark:text-white/30 font-medium">{profileBio.length}/150</span>
                          </div>
                          <textarea
                            value={profileBio}
                            onChange={(e) => setProfileBio(e.target.value.slice(0, 150))}
                            rows={3}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 text-slate-900 dark:text-white text-sm resize-none"
                            placeholder="Tell communities about yourself..."
                          />
                        </div>

                        <button
                          onClick={async () => {
                            if (!/^[a-z0-9_]{1,64}$/.test(profileUsername.trim().toLowerCase())) {
                              setUsernameErr("Chat username is invalid");
                              return;
                            }
                            setSavingProfile(true);
                            try {
                              const token = await getToken();
                              if (!token) {
                                throw new Error("Your session has expired. Sign in again.");
                              }
                              const response = await fetch(
                                "/api/profile?action=save-chat-profile",
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({
                                    displayName: profileFullName,
                                    username: profileUsername,
                                    biography: profileBio,
                                    profileImageUrl: profilePic || null,
                                  }),
                                },
                              );
                              const payload = await response.json().catch(() => null);
                              if (!response.ok || !payload?.success) {
                                throw new Error(
                                  payload?.error || "Failed to save Chat profile",
                                );
                              }
                              toast.success("Profile updated successfully!");
                              window.location.reload();
                            } catch (err: any) {
                              toast.error(err.message || "Failed to save profile");
                            } finally {
                              setSavingProfile(false);
                            }
                          }}
                          disabled={savingProfile}
                          className="w-full py-3 bg-[#3b82f6] hover:bg-[#2563eb] active:scale-95 text-white text-xs uppercase font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                          Save Profile
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'refer' && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="bg-slate-50 dark:bg-[#242424] p-5 rounded-2xl border border-slate-200 dark:border-white/5 text-left">
                      <p className="text-[10px] font-black uppercase text-[#3b82f6] tracking-widest mb-1 shadow-sm">Plugsy Rewards</p>
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Share &amp; Earn {activeMedal ? Math.round((0.10 + activeMedal.commissionBonus) * 100) : 10}% cash</h4>
                      <p className="text-xs text-slate-500 dark:text-[#a1a1a1] leading-relaxed mb-4">
                        Share your unique purchase code. When friends plug it in at checkout, you instantly receive {activeMedal ? Math.round((0.10 + activeMedal.commissionBonus) * 100) : 10}% of their actual cart total directly to your withdrawal account balance.
                      </p>
                      
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-black/25 rounded-xl border border-slate-200 dark:border-white/5">
                          <code className="font-mono text-lg font-black tracking-widest text-[#3b82f6]">{purchaseCode}</code>
                          <button
                            onClick={handleCopy}
                            className="bg-[#3b82f6] hover:bg-[#2563eb] active:scale-95 text-white text-[10px] uppercase font-bold py-1.5 px-3 rounded-lg transition-all"
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] mt-4 border-t border-slate-200 dark:border-white/5 pt-4">
                        <div className="p-3 bg-slate-100 dark:bg-black/30 rounded-xl">
                          <p className="text-slate-500 dark:text-[#a1a1a1] uppercase mb-1">Total Earned</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white">₦{Number(profileStats.total_referral_earnings || 0).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-slate-100 dark:bg-black/30 rounded-xl">
                          <p className="text-slate-500 dark:text-[#a1a1a1] uppercase mb-1">Code Used</p>
                          <p className="text-sm font-black text-slate-900 dark:text-white">{profileStats.referral_count} times</p>
                        </div>
                      </div>

                      <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-xl mt-3 flex justify-between items-center text-[11px]">
                        <span className="text-green-600 dark:text-green-400 font-bold">Unwithdrawn Balance:</span>
                        <span className="font-bold text-slate-900 dark:text-white">₦{Number(profileStats.balance || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'notifications' && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="bg-slate-50 dark:bg-[#242424] p-5 rounded-2xl border border-slate-200 dark:border-white/5 text-left">
                      <p className="text-[10px] font-black uppercase text-[#3b82f6] tracking-widest mb-1 shadow-sm">System Sync</p>
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Notification Status</h4>
                      <p className="text-xs text-slate-500 dark:text-[#a1a1a1] leading-relaxed mb-6">
                        If you are not receiving alerts, your connection to our push server might be out of sync. Use the button below to re-verify your subscription and repair the link.
                      </p>
                      
                      <button
                        onClick={async () => {
                          if (!user) return;
                          toast.loading("Repairing connection...", { id: "repair-notif" });
                          try {
                            const repaired = await requestOneSignalPermission(user.id, await getToken());
                            if (!repaired.active) throw new Error(repaired.code);
                            toast.success(repaired.registered ? "Notifications repaired successfully!" : "Alerts are active; registration needs repair.", { id: "repair-notif" });
                          } catch (err: any) {
                            toast.error("Repair failed: " + err.message, { id: "repair-notif" });
                          }
                        }}
                        className="w-full py-4 bg-[#111] hover:bg-black border border-white/5 active:scale-95 text-white text-xs uppercase font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl"
                      >
                        🔄 Refresh Notification Settings
                      </button>
                      <p className="text-[10px] text-slate-500 text-center mt-4 italic">
                        Recommended if you're not getting order updates or chat alerts.
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
