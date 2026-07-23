import { LiquidGlass } from "../components/ui/LiquidGlass";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Logo } from '../components/ui/Logo';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from "@supabase/supabase-js";
import { supabase, setSupabaseAuth } from '../lib/supabase';
import { useClerk, useUser, useAuth } from '@clerk/clerk-react';
import { optimizeCloudinaryUrl } from '../lib/cloudinary';
import { toast } from 'react-hot-toast';
import { SafeImage } from '../components/SafeImage';
import { ScaleButton } from '../components/PageTransition';
import { PlanEditor } from '../components/PlanEditor';
import { cn } from '../lib/utils';
import { 
  Users as UsersIcon, 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  MessageSquare, 
  Menu, 
  X, 
  LogOut, 
  LayoutDashboard, 
  Crown, 
  Stars, 
  Settings as SettingsIcon,
  Search,
  Filter,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  TrendingUp,
  Inbox,
  Clock,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Gift,
  Zap,
  Loader2,
  Globe,
  Award,
  Megaphone
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { chatService } from '../services/chatService';
import { useOnlinePresence } from '../contexts/OnlinePresenceContext';

export default function Admin() {
  const navigate = useNavigate();
  const { isUserOnline } = useOnlinePresence();
  const { signOut } = useClerk();
  const { isLoaded, userId, getToken } = useAuth();
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  
  const [users, setUsers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [portfolioPurchases, setPortfolioPurchases] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [site_settings, setSiteSettings] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [fetchErrors, setFetchErrors] = useState<Record<string, string | null>>({});
  const [adminSubscriptions, setAdminSubscriptions] = useState<any[]>([]);
  const [adminSubsLoading, setAdminSubsLoading] = useState(false);

  // Broadcast Email States
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([]);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'selected'>('all');

  // Safety utility to ensure we always have an array
  const safeArray = (arr: any) => Array.isArray(arr) ? arr : [];

  // Safe formatting helper for currency
  const formatCurrency = (amount: any) => {
    const val = Number(amount || 0);
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(val);
  };

  // Safe status formatting helper
  const formatStatus = (status: any) => {
    if (!status) return 'N/A';
    return String(status).replace(/_/g, ' ').toUpperCase();
  };

  // Safe date formatting
  const formatDate = (dateStr: any) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    } catch (e) {
      return 'N/A';
    }
  };

  useEffect(() => {
    async function fetchMyProfile() {
      if (!userId) return;
      try {
        await setSupabaseAuth(getToken, true);
        const { data } = await supabase.from('profiles').select('*').eq('clerk_id', userId).maybeSingle();
        if (data) setCurrentUserProfile(data);
      } catch (e) {
        console.error("Profile fetch error:", e);
      }
    }
    fetchMyProfile();
  }, [userId, getToken]);
  
  const [activeTab, setActiveTab] = useState(tabParam || 'overview');
  const [withdrawalSubTab, setWithdrawalSubTab] = useState<'pending' | 'history'>('pending');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginsInput, setLoginsInput] = useState<Record<string, string>>({});

  // Financial Dashboard States
  const [financialData, setFinancialData] = useState<{
    totalLiquidity: number;
    pendingFundingEstimate: number;
    users: any[];
    transactions: any[];
  } | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [financialSearch, setFinancialSearch] = useState('');

  const fetchFinancialData = async () => {
    setFinancialLoading(true);
    setFinancialError(null);
    try {
      const token = await getToken();
      if (!token) return;
      await setSupabaseAuth(getToken, true);

      const res = await fetch(`/api/admin?action=financial-dashboard&callerClerkId=${user?.id}`, {
        headers: {
          'x-caller-clerk-id': user?.id || ''
        }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setFinancialData({
        totalLiquidity: data.totalLiquidity,
        pendingFundingEstimate: data.pendingFundingEstimate,
        users: data.users || [],
        transactions: data.transactions || []
      });
    } catch (err: any) {
      console.error("Failed to fetch financial data:", err);
      setFinancialError(err.message || "Failed to load financial records.");
    } finally {
      setFinancialLoading(false);
    }
  };

  const handleUpdateTxStatus = async (txId: string, newStatus: 'success' | 'failed') => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co';
      const serviceKey = await Promise.resolve(import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
      const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey as string, { auth: { persistSession: false } }) : supabase;

      // Fetch transaction
      const { data: tx, error: fetchErr } = await adminClient
        .from("wallet_transactions")
        .select("*")
        .eq("id", txId)
        .single();

      if (fetchErr || !tx) {
        toast.error("Failed to find transaction detail.");
        return;
      }

      if (newStatus === 'failed') {
        const { data: userProfile, error: profileErr } = await adminClient
          .from("profiles")
          .select("balance")
          .eq("clerk_id", tx.user_id)
          .single();

        if (profileErr || !userProfile) {
          toast.error("Failed to fetch user profile for refund.");
          return;
        }

        let newBalance = userProfile.balance || 0;
        
        const txType = (tx.type || "").toUpperCase();
        if (txType === "FUND" || txType === "WALLET_FUNDING" || txType === "P2P_RECEIVE") {
          // If a deposit or received funds fail, do NOT refund and do NOT deduct. 
          // The money was never added to the balance because it was pending.
          newBalance = newBalance; // Unchanged
        } else if (txType === "WITHDRAW" || txType === "P2P_SEND") {
          // If a withdrawal or sent funds fail, refund them (add to balance)
          const refundAmount = Number(tx.amount || 0) + Number(tx.fee || 0);
          newBalance = newBalance + refundAmount;
        } else {
          // Default fallback (e.g. legacy logic)
          const refundAmount = Number(tx.amount || 0) + Number(tx.fee || 0);
          newBalance = newBalance + refundAmount;
        }

        const { error: balanceErr } = await adminClient
          .from("profiles")
          .update({ balance: newBalance })
          .eq("clerk_id", tx.user_id);

        if (balanceErr) {
          toast.error("Failed to refund user balance: " + balanceErr.message);
          return;
        }

        // Update corresponding withdrawal status if any
        await adminClient
          .from("withdrawals")
          .update({ status: "failed", admin_note: "Manually marked failed" })
          .eq("user_id", tx.user_id)
          .eq("amount", tx.amount)
          .eq("status", "pending");
      } else if (newStatus === 'success') {
        // Update corresponding withdrawal status if any
        await adminClient
          .from("withdrawals")
          .update({
            status: "confirmed",
            confirmed_by: user?.id || 'admin',
            confirmed_at: new Date().toISOString()
          })
          .eq("user_id", tx.user_id)
          .eq("amount", tx.amount)
          .eq("status", "pending");
      }

      // Update wallet transaction status
      const { error: updateErr } = await adminClient
        .from("wallet_transactions")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", txId);

      if (updateErr) {
        toast.error("Failed to update transaction status: " + updateErr.message);
      } else {
        toast.success(`Transaction successfully marked as ${newStatus}`);
        fetchFinancialData();
      }
    } catch (err: any) {
      console.error("Error updating transaction status:", err);
      toast.error(err.message || "Failed to update status.");
    }
  };

  useEffect(() => {
    if (activeTab === 'financial') {
      fetchFinancialData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'subscriptions') {
      const fetchAdminSubs = async () => {
        setAdminSubsLoading(true);
        const { data: subscriptionsData, error } = await supabase
          .from("orders")
          .select("*")
          .eq("delivery_status", "login_sent")
          .order("created_at", { ascending: false });

        console.log("[subscriptions] data:", subscriptionsData, error);
        if (!error) {
           setAdminSubscriptions(subscriptionsData || []);
        }
        setAdminSubsLoading(false);
      };
      fetchAdminSubs();
    }
  }, [activeTab]);

  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);

  const fetchWithdrawals = async () => {
    setWithdrawalsLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co';
      const serviceKey = await Promise.resolve(import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
      const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey as string, { auth: { persistSession: false } }) : supabase;

      const { data, error } = await adminClient
        .from('withdrawals')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error("[admin] fetch withdrawals error:", error);
        setFetchErrors(prev => ({ ...prev, withdrawals: true }));
      } else {
        setWithdrawals(data || []);
        setFetchErrors(prev => ({ ...prev, withdrawals: false }));
      }
    } catch (err) {
      console.error("[admin] fetch withdrawals crash:", err);
      setFetchErrors(prev => ({ ...prev, withdrawals: true }));
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'withdrawals') {
      fetchWithdrawals();
    }
  }, [activeTab]);

  const [orderFilter, setOrderFilter] = useState<'pending' | 'all'>('pending');

  // Filters for User Table
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all');

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    navigate(`/admin?tab=${id}`, { replace: true });
    setIsSidebarOpen(false);
    
    // Reset error for tab when switching back to it
    const colMap: any = { users: 'profiles', communities: 'chats', chats: 'chats', subscriptions: 'subscriptions', withdrawals: 'withdrawals', settings: 'site_settings', plans: 'plans' };
    if (colMap[id]) setFetchErrors(prev => ({ ...prev, [colMap[id]]: false }));
  };

  // Derived Pending Queue
  const pendingQueue = orders.filter((o: any) => {
    const status = o.payment_status || o.status;
    const dStatus = o.delivery_status;
    const isValidStatus = status === 'paid' || status === 'pending';
    const isNotDelivered = dStatus !== 'login_sent' && dStatus !== 'delivered';
    const isMedal = o.product_name?.toLowerCase().includes("medal");
    return isValidStatus && isNotDelivered && !isMedal;
  });
  
  // Real-time handling is already managed by fetchAll which updates orders
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Helper to fetch everything
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchAll = React.useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      
      await setSupabaseAuth(getToken, true);
      
      const fetchAdminData = async (collection: string, delay = 0, retries = 1) => {
        try {
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
          setFetchErrors(prev => ({ ...prev, [collection]: false }));

          // Helper for timeout
          const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms));

          const executeFetch = async () => {
            console.log(`[executeFetch] Starting fetch for ${collection}...`);
            // FORCE Direct Table Fetch for all critical tables to bypass middleman API issues & HTML-as-JSON errors
            const tableMap: Record<string, string> = {
              'plans': 'plans',
              'subscriptions': 'subscriptions',
              'profiles': 'profiles',
              'orders': 'orders',
              'chats': 'chats',
              'messages': 'messages',
              'withdrawals': 'withdrawals',
              'portfolio_purchases': 'portfolio_purchases',
              'site_settings': 'site_settings'
            };
            
            const table = tableMap[collection];
            
            if (table) {
                console.log(`[executeFetch] Mapped ${collection} to table ${table}`);
                
                // Use API for critical tables to bypass client-side RLS limits securely
                if (collection === 'orders' || collection === 'profiles' || collection === 'subscriptions') {
                  console.log(`[executeFetch] Using API for ${collection} fetch...`);
                  const res = await fetch(`/api/admin?action=list-${collection}&callerClerkId=${userId}`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                      if (collection === 'orders') return safeArray(data.orders);
                      if (collection === 'profiles') return safeArray(data.profiles);
                      if (collection === 'subscriptions') return safeArray(data.subscriptions);
                    }
                  }
                  console.warn(`[executeFetch] API fetch for ${collection} failed, falling back to direct Supabase...`);
                }

                let clientToUse = supabase;
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co';
                const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
                
                if (serviceKey && ['orders', 'profiles', 'withdrawals', 'subscriptions', 'chats', 'messages', 'portfolio_purchases'].includes(collection)) {
                   console.log(`[executeFetch] Using service role for ${collection}`);
                   clientToUse = createClient(supabaseUrl, serviceKey as string, { auth: { persistSession: false } });
                }
                
                let query = clientToUse.from(table).select('*');
                
                if (['profiles', 'orders', 'plans', 'subscriptions', 'withdrawals', 'portfolio_purchases'].includes(collection)) {
                  query = query.order('created_at', { ascending: false });
                }
                
                if (collection === 'profiles') query = query.limit(1000);
                if (collection === 'orders') query = query.limit(1000);

                console.log(`[executeFetch] Awaiting supabase query for ${table}...`);
                const { data, error } = await query;
                console.log(`[executeFetch] Finished supabase query for ${table}. Error:`, error?.message);
                
                if (error) {
                  console.error(`[ADMIN] Supabase error for ${table}:`, error);
                  
                  // Clean anonymous client fallback for tables affected by Clerk JWT RLS errors
                  if (collection === 'profiles') {
                    console.log(`[executeFetch] Trying fallback for profiles using clean anonymous client`);
                    try {
                      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co';
                      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6krQD2xCzjSLtaol0F0YNg_bCk3ZpNa';
                      const cleanClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
                      const { data: fallback, error: fallbackErr } = await cleanClient.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000);
                      if (fallbackErr) throw fallbackErr;
                      console.log(`[executeFetch] Clean anonymous fallback for profiles succeeded:`, fallback?.length);
                      return safeArray(fallback);
                    } catch (fallbackE) {
                      console.error(`[executeFetch] Clean anonymous fallback for profiles failed:`, fallbackE);
                    }
                  }

                  if (collection === 'orders') {
                    console.log(`[executeFetch] Trying fallback for orders`);
                    try {
                      const { data: fallback, error: fallbackErr } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
                      if (!fallbackErr) return safeArray(fallback);
                      
                      // Also try clean anonymous client for orders if standard failed
                      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co';
                      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6krQD2xCzjSLtaol0F0YNg_bCk3ZpNa';
                      const cleanClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
                      const { data: fallbackAnon, error: fallbackAnonErr } = await cleanClient.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
                      if (fallbackAnonErr) throw fallbackAnonErr;
                      return safeArray(fallbackAnon);
                    } catch (fallbackE) {
                      console.error(`[executeFetch] Fallbacks for orders failed:`, fallbackE);
                    }
                  }
                  
                  throw error;
                }
                
                return safeArray(data);
            }

            // We removed intermediate APIs in favor of direct DB queries to stay under Vercel 12 fn limit.
            // All essential tables are covered above. Return empty array if requested collection not covered.
            return [];
          };

          // Wrap fetch with 45s timeout
          try {
            return await Promise.race([executeFetch(), timeout(45000)]);
          } catch (e: any) {
            if (e.message === 'TIMEOUT' && retries > 0) {
              console.warn(`Retrying fetch for ${collection} due to timeout...`);
              return fetchAdminData(collection, 1000, retries - 1);
            }
            throw e;
          }
        } catch (e) {
          console.error(`Error fetching ${collection}:`, e);
          setFetchErrors(prev => ({ ...prev, [collection]: true }));
          return collection === 'site_settings' ? {} : [];
        }
      };

      const [
        usersData,
        ordersData,
        subsData,
        chatsData,
        plansData,
        withdrawalsData,
        portfolioData,
        configData
      ] = await Promise.all([
        fetchAdminData('profiles', 500),
        fetchAdminData('orders'),
        fetchAdminData('subscriptions', 1000), // 1s delay
        fetchAdminData('chats', 500),
        fetchAdminData('plans', 500),
        tabParam !== 'pending' ? fetchAdminData('withdrawals', 1500) : Promise.resolve(null),
        tabParam !== 'pending' ? fetchAdminData('portfolio_purchases', 1000) : Promise.resolve(null),
        tabParam !== 'pending' ? fetchAdminData('site_settings', 500) : Promise.resolve(null)
      ]);

      if (usersData) setUsers(usersData);
      
      // Fetch all admins from Clerk backend and set state (Bug 2)
      try {
        const res = await fetch("/api/admin?action=list-admins");
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            console.log("[admin-users] admins found from Clerk:", data.admins?.length);
            setAdmins(data.admins || []);
          } else {
            // Quiet warning for Clerk config or other handled errors
            console.warn("[admin-users] Clerk admin fetch info/warning:", data.error || "unsuccessful");
            // Trigger fallback
            throw new Error(data.error || "Clerk admin fetch unsuccessful");
          }
        } else {
          throw new Error(`Response status: ${res.status}`);
        }
      } catch (err: any) {
        console.warn("Admins fetch from Clerk not available, falling back to profiles database list.");
        try {
          const { data: adminsData } = await supabase
            .from("profiles")
            .select("*")
            .eq("role", "admin")
            .order("created_at", { ascending: true });
          setAdmins(adminsData || []);
        } catch (fbErr) {
          console.warn("Fallback profiles fetch failed:", fbErr);
        }
      }

      // Fetch latest 100 users for separate list below admins (Bug 2)
      try {
        const { data: allUsersData, error: allUsersError } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        
        console.log("[admin-users] allUsers found:", allUsersData?.length, allUsersError);
        setAllUsers(allUsersData || []);
      } catch (err: any) {
        console.error("AllUsers fetch crash:", err);
      }
      if (ordersData) setOrders(ordersData);
      if (subsData) setSubscriptions(subsData);
      if (chatsData) setChats(chatsData);
      if (plansData) setPlans(plansData);
      if (portfolioData) setPortfolioPurchases(portfolioData);
      if (withdrawalsData !== null && withdrawalsData !== undefined) setWithdrawals(withdrawalsData);
      
      if (configData !== null && configData !== undefined) {
        const isKeyValPattern = configData.length > 0 && 'setting_key' in configData[0];
        if (isKeyValPattern) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const settingsObj = configData.reduce((acc: any, item: any) => {
            acc[item.setting_key] = item.setting_value;
            return acc;
          }, {});
          setSiteSettings(settingsObj);
        } else if (configData.length > 0) {
          setSiteSettings(configData[0]);
        }
      }
    } catch (e) {
      console.error("Admin fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [getToken, tabParam]);

  useEffect(() => {
    setLoading(true);
    
    // Initial fetch
    fetchAll();

      const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

      // Real-time listener specifically for the orders table to sync Pending Queue
      const ordersChannel = supabase.channel(`orders-sync-${uniqueSuffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
           console.log('🔔 Realtime Order Update', payload);
           
           if (payload.eventType === 'INSERT') {
             const newOrder = payload.new;
             toast.success(`NEW ORDER: ${newOrder.product_name} from ${newOrder.user_email || 'a user'}`, {
               icon: '💰',
               duration: 6000,
               position: 'top-right'
             });
           } else if (payload.eventType === 'UPDATE') {
             const oldOrder = payload.old;
             const newOrder = payload.new;
             // Check if payment was processed
             if (oldOrder && newOrder) {
               const wasPaid = (oldOrder.status !== 'paid' && oldOrder.status !== 'success') && 
                              (newOrder.status === 'paid' || newOrder.status === 'success');
               
               if (wasPaid) {
                 toast.success(`PURCHASE PROCESSED: ${newOrder.product_name} for ${newOrder.user_email || 'a user'}`, {
                   icon: '✅',
                   duration: 8000,
                   position: 'top-right'
                 });
               }
             }
           }
           
           fetchAll();
        })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') {
            console.warn(`⚠️ Orders Realtime Status: ${status}`);
          }
        });

      const channel = supabase.channel(`admin-broadcast-${uniqueSuffix}`)
        .on('broadcast', { event: 'new_message' }, () => {
           console.log('Admin broadcast new_message');
           fetchAll();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
           fetchAll();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
           fetchAll();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'subscriptions' }, (payload: any) => {
           const newSub = payload.new;
           toast.success(`NEW SUBSCRIPTION: ${newSub.product_name || 'Premium Plan'} active for ${newSub.user_email || 'a user'}`, {
             icon: '👑',
             duration: 7000,
             position: 'top-right'
           });
           fetchAll();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portfolio_purchases' }, (payload: any) => {
           const newPurchase = payload.new;
           toast.success(`PORTFOLIO PURCHASE: ₦${newPurchase.amount?.toLocaleString()} from ${newPurchase.user_email || 'a user'}`, {
             icon: '📁',
             duration: 6000,
             position: 'top-right'
           });
           fetchAll();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Admin Realtime Connected');
          } else {
            console.warn(`⚠️ Admin Realtime Status: ${status}`);
          }
        });

      // Polling Fallback (Every 30 seconds)
      const pollingInterval = setInterval(() => {
        console.log('🔄 Polling for updates...');
        fetchAll();
      }, 30000);
      
      return () => {
        clearInterval(pollingInterval);
        if (channel) supabase.removeChannel(channel).catch(() => {});
        if (ordersChannel) supabase.removeChannel(ordersChannel).catch(() => {});
      };
    }, [fetchAll, userId]);


  const [dbStats, setDbStats] = useState({
    totalRevenue: 0,
    portfolioRevenue: 0,
    combinedRevenue: 0,
    activeSubs: 0,
    expiredSubs: 0,
    totalOrders: 0,
    pendingOrders: 0,
    totalUsers: 0,
    loading: true
  });

  useEffect(() => {
    const loadStats = async () => {
      console.log("[admin] loading stats from database via admin API proxy...");
      try {
        if (!userId) return;
        await setSupabaseAuth(getToken, true);
        
        // Fetch ALL orders via admin API proxy to bypass RLS securely
        const ordersRes = await fetch(`/api/admin?action=list-orders&callerClerkId=${userId}`);
        if (!ordersRes.ok) throw new Error("Failed to fetch orders from admin API");
        const ordersData = await ordersRes.json();
        if (!ordersData.success) throw new Error(ordersData.error || "Unsuccessful orders API fetch");
        const orders = ordersData.orders || [];

        console.log("[admin] total orders fetched:", orders.length);
        const now = new Date();

        // Revenue: completed + paid
        const subscriptionRevenue = orders
          .filter((o: any) => o.status === "completed" || o.status === "paid")
          .reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);

        // Active: completed, login_sent, not expired
        const activeSubsCount = orders.filter((o: any) =>
          o.status === "completed" &&
          o.delivery_status === "login_sent" &&
          o.subscription_expires_at &&
          new Date(o.subscription_expires_at) > now
        ).length;

        // Expired: completed, login_sent, IS expired
        const expiredSubsCount = orders.filter((o: any) =>
          o.status === "completed" &&
          o.delivery_status === "login_sent" &&
          o.subscription_expires_at &&
          new Date(o.subscription_expires_at) <= now
        ).length;

        // Pending delivery
        const pendingOrdersCount = orders.filter((o: any) => {
          const status = o.status;
          const delivery = o.delivery_status;
          const isMedal = o.product_name?.toLowerCase().includes("medal");
          return status === "paid" && delivery === "pending_login" && !isMedal;
        }).length;

        // Portfolio revenue via admin API proxy
        const portfolioRes = await fetch(`/api/admin?action=list-portfolio_purchases&callerClerkId=${userId}`);
        const portfolioData = portfolioRes.ok ? await portfolioRes.json() : { success: false };
        const portfolioPurchasesList = portfolioData.success ? (portfolioData.portfolio_purchases || []) : [];
        const portfolioRevenue = portfolioPurchasesList
          .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

        // Total users via admin API proxy
        const profilesRes = await fetch(`/api/admin?action=list-profiles&callerClerkId=${userId}`);
        const profilesData = profilesRes.ok ? await profilesRes.json() : { success: false };
        const profilesList = profilesData.success ? (profilesData.profiles || []) : [];
        const totalUsersCount = profilesList.length;

        const finalStats = {
          totalRevenue: subscriptionRevenue,
          portfolioRevenue: portfolioRevenue,
          combinedRevenue: subscriptionRevenue + portfolioRevenue,
          activeSubs: activeSubsCount,
          expiredSubs: expiredSubsCount,
          totalOrders: orders.length,
          pendingOrders: pendingOrdersCount,
          totalUsers: totalUsersCount || 0,
          loading: false
        };

        console.log("[admin] FINAL STATS:", finalStats);
        setDbStats(finalStats);

      } catch (e: any) {
        console.error("[admin] stats crash:", e.message);
        setDbStats(prev => ({ ...prev, loading: false }));
      }
    };

    if (userId) {
      loadStats();
      const interval = setInterval(loadStats, 60000);
      return () => clearInterval(interval);
    }
  }, [getToken, userId]);

  const stats = useMemo(() => {
    const safeOrders = safeArray(orders);
    const safeSubs = safeArray(subscriptions);
    const safeChats = safeArray(chats);
    const safeUsers = safeArray(users);

    const now = Date.now();
    const activeSubs = safeSubs.filter(s => s?.status === 'active' && (!s.ends_at || new Date(s.ends_at).getTime() > now)).length;
    const expiredSubs = safeSubs.filter(s => s?.status !== 'active' || (s?.ends_at && new Date(s.ends_at).getTime() <= now)).length;
    const openChats = safeChats.filter(c => c?.status === 'open').length;
    const needsAttention = safeChats.filter(c => c?.needs_admin_attention).length;
    const pendingCount = safeOrders.filter(o => {
      const status = o.payment_status || o.status;
      const dStatus = o.delivery_status;
      const isValidStatus = status === 'paid' || status === 'pending';
      const isNotDelivered = dStatus !== 'login_sent' && dStatus !== 'delivered';
      const isMedal = o.product_name?.toLowerCase().includes("medal");
      return isValidStatus && isNotDelivered && !isMedal;
    }).length;

    const subscriptionTotal = safeOrders
      .filter(o => o.payment_status === 'paid' || o.status === 'paid' || o.status === 'confirmed' || o.status === 'success' || o.delivery_status === 'delivered')
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);
    
    const portfolioTotal = safeArray(portfolioPurchases)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const totalVolume = subscriptionTotal + portfolioTotal;
    
    return {
      totalUsers: safeUsers.length,
      totalOrders: safeOrders.length,
      totalVolume,
      subscriptionTotal,
      portfolioTotal,
      activeSubs,
      expiredSubs,
      openChats,
      needsAttention,
      pendingCount
    };
  }, [users, orders, subscriptions, chats, portfolioPurchases]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    const sourceArr = allUsers.length > 0 ? allUsers : users;
    return sourceArr.filter(u => {
      const matchesSearch = userSearch === '' || 
        (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase()) || 
        (u.email || '').toLowerCase().includes(userSearch.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    }).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [allUsers, users, userSearch, roleFilter]);

  // Helper for admin operations calling the API
  const adminOp = async (op: string, payload: any = {}) => {
    try {
      await setSupabaseAuth(getToken, true);
      const { collection, id, data } = payload;
      let result;
      switch (op) {
        case 'add':
          result = await supabase.from(collection).insert(data).select().single();
          if (result.error) throw result.error;
          return result.data;
        case 'update':
          result = await supabase.from(collection).update(data).eq('id', id).select();
          if (result.error) throw result.error;
          return result.data && result.data.length > 0 ? result.data[0] : null;
        case 'delete':
          result = await supabase.from(collection).delete().eq('id', id);
          if (result.error) throw result.error;
          return { success: true };
        default:
          throw new Error('Unknown admin op: ' + op);
      }
    } catch (err: any) {
      console.error('Admin Op Error:', err);
      // Fallback or bubble up
      throw err;
    }
  };


  const [sendingLogins, setSendingLogins] = useState<Record<string, boolean>>({});

  const handleSendLogins = async (order: any) => {
    const text = loginsInput[order.id];
    if (!text) {
      toast.error("Please enter logins.");
      return;
    }
    
    setSendingLogins(prev => ({ ...prev, [order.id]: true }));

    try {
      const res = await fetch("/api/admin?action=send-login-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          loginDetails: text,
          adminEmail: user?.primaryEmailAddress?.emailAddress || "admin"
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process login delivery");
      }

      setOrders(prev => prev.filter(o => o.id !== order.id));
      toast.success("Login details sent to " + (order.user_name || order.user_email));
      setLoginsInput(prev => ({ ...prev, [order.id]: '' }));
    } catch (err: any) {
      console.error("[sendLogin] error:", err);
      toast.error("Failed to send login: " + err.message);
    } finally {
      setSendingLogins(prev => ({ ...prev, [order.id]: false }));
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastSubject || !broadcastContent) {
      toast.error("Subject and content are required");
      return;
    }

    let recipients: string[] = [];
    if (broadcastTarget === 'all') {
      recipients = users.map(u => u.email).filter(Boolean);
    } else {
      recipients = selectedUserEmails;
    }

    if (recipients.length === 0) {
      toast.error("No recipients selected");
      return;
    }

    const confirmed = window.confirm(`Send this email to ${recipients.length} recipients?`);
    if (!confirmed) return;

    setSendingBroadcast(true);
    try {
      const res = await fetch("/api/admin?action=broadcast-email", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          subject: broadcastSubject,
          html: broadcastContent,
          recipientEmails: recipients,
          callerClerkId: user?.id
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send broadcast");
      }

      toast.success(`Broadcast sent successfully to ${recipients.length} users!`);
      setBroadcastSubject('');
      setBroadcastContent('');
      setSelectedUserEmails([]);
    } catch (err: any) {
      console.error("[broadcast] error:", err);
      toast.error("Failed to send broadcast: " + err.message);
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleCreatePlan = async () => {
    try {
      await adminOp('add', {
        collection: 'plans',
        data: {
          name: 'New Product',
          price: 0,
          discount_percent: 0,
          description: '',
          image_url: ''
        }
      });
      toast.success("✨ Product Created Successfully");
    } catch (err: any) {
      console.error("Supabase create plan error:", JSON.stringify(err, null, 2), err);
      toast.error(`Failed to create product: ${err.message || 'Unknown error'}`);
    }
  };

  const handleUpdatePlan = async (id: string, data: any) => {
    try {
      const planName = data.name || data.product_name || 'New Product';
      const price = data.price;
      const discountPriceValue = data.discount_price != null ? data.discount_price : data.discountPrice;
      const discountExpiry = data.discount_expires_at;
      const isActive = data.is_active !== undefined ? data.is_active : true;

      const allowedData = {
        name: planName,
        price: Number(price) || 0,
        discount_price: discountPriceValue !== null && discountPriceValue !== '' ? Number(discountPriceValue) : null,
        discount_expires_at: discountExpiry || null,
        description: data.description || '',
        features: data.features || [],
        image_url: data.image_url || ''
      };

      // Optimistic Update
      setPlans(prev => prev.map(p => p.id === id ? { ...p, ...allowedData } : p));

      console.log("[admin plans] saving plan:", {
        id: id,
        price: price,
        discount_price: discountPriceValue,
        discount_expires_at: discountExpiry
      });

      const { data: updateData, error } = await supabase
        .from("plans")
        .update({
          name: planName,
          price: Number(price),
          discount_price: allowedData.discount_price,
          discount_expires_at: allowedData.discount_expires_at,
          is_active: isActive,
          description: data.description || '',
          features: data.features || [],
          image_url: data.image_url || ''
        })
        .eq("id", id);

      console.log("[admin plans] save result:", updateData, error);

      if (error) {
        // Fallback to adminOp due to RLS if needed, but logging per prompt
        await adminOp('update', { collection: 'plans', id, data: allowedData });
      }

      toast.success("✨ Product Updated Successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(`Error: ${err.message || 'Failed to update plan'}`);
      throw err;
    }
  };

  const handleUpdateSubscription = async (id: string, data: any) => {
    try {
      await adminOp('update', { collection: 'subscriptions', id, data: { ...data } });
      setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
      toast.success("💾 Changes saved!");
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to update subscription: ${err.message}`);
    }
  };

  const handleDeletePlan = async (id: string) => {
    const planObj = plans.find(p => p.id === id);
    if (!planObj) return;

    const confirmed = window.confirm(
      "Deactivate this product? It will be hidden from " +
      "users but order history will be preserved."
    );
    if (!confirmed) return;

    try {
      await adminOp('update', { 
        collection: 'plans', 
        id, 
        data: { is_active: false } 
      });
      setPlans(prev => prev.map(p => p.id === id ? { ...p, is_active: false } : p));
      toast.success("✅ Product deactivated");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to deactivate product: " + err.message);
    }
  };

  const handleReactivatePlan = async (id: string) => {
    const confirmed = window.confirm("Reactivate this product?");
    if (!confirmed) return;

    try {
      await adminOp('update', { 
        collection: 'plans', 
        id, 
        data: { is_active: true } 
      });
      setPlans(prev => prev.map(p => p.id === id ? { ...p, is_active: true } : p));
      toast.success("✅ Product reactivated");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to reactivate: " + err.message);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const settings: Record<string, any> = {
      price_per_reward: Number(formData.get('pricePerReward')),
      withdrawal_threshold: Number(formData.get('withdrawalThreshold')),
      support_email: formData.get('supportEmail'),
      support_whatsapp: formData.get('supportWhatsApp'),
      portfolio_tutorial_url: formData.get('portfolioTutorialUrl'),
    };
    
    try {
      const updatedAt = new Date().toISOString();
      const { data: currentSettings } = await supabase.from('site_settings').select('id, setting_key').limit(100);
      
      if (!currentSettings || currentSettings.length === 0) {
        // Try inserting as single row if nothing exists
        await adminOp('add', { 
          collection: 'site_settings', 
          data: { ...settings, updated_at: updatedAt } 
        });
      } else if ('setting_key' in currentSettings[0]) {
        // Legacy Key/Value pattern
        const promises = Object.entries(settings).map(([key, value]) => {
          return supabase.from('site_settings').update({ setting_value: String(value), updated_at: updatedAt }).eq('setting_key', key);
        });
        await Promise.all(promises);
      } else {
        // Column pattern - use the actual first ID found
        const firstId = currentSettings[0].id;
        await adminOp('update', { 
          collection: 'site_settings', 
          id: firstId, 
          data: { ...settings, updated_at: updatedAt } 
        });
      }
      
      toast.success("✅ Site configuration updated!");
      // Force refresh settings locally
      setSiteSettings(prev => ({ ...prev, ...settings, updated_at: updatedAt }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to update settings.");
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (!window.confirm(`Are you sure you want to delete profile for ${email}? This will NOT delete them from Clerk, only from the Plugsy database.`)) return;
    try {
      await adminOp('delete', { collection: 'profiles', id });
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success("User profile removed from database.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete user profile.");
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete this order?`)) return;
    try {
      // Optimistic Delete
      setOrders(prev => prev.filter(o => o.id !== id));
      
      await adminOp('delete', { collection: 'orders', id });
      toast.success("Order deleted.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete order.");
    }
  };

  const sidebarLinks = [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'pending', icon: Clock, label: 'Pending Queue' },
    { id: 'users', icon: UsersIcon, label: 'Users' },
    { id: 'orders', icon: CreditCard, label: 'Orders' },
    { id: 'medals', icon: Award, label: 'Medals' },
    { id: 'financial', icon: DollarSign, label: 'Financials' },
    { id: 'communities', icon: Globe, label: 'Communities' },
    { id: 'chats', icon: MessageSquare, label: 'Support Chats' },
    { id: 'plans', icon: Stars, label: 'Plans/Pricing' },
    { id: 'subscriptions', icon: Crown, label: 'Subscriptions' },
    { id: 'broadcast', icon: Mail, label: 'Email Broadcast' },
    { id: 'settings', icon: SettingsIcon, label: 'Site Settings' }
  ];

  if (loading && users.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg gap-6">
        <RefreshCw className="w-12 h-12 text-brand-accent animate-spin" />
        <p className="text-[10px] text-brand-text-secondary uppercase tracking-[0.3em] font-black animate-pulse">✨ Syncing with Cloud...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row bg-brand-bg min-h-screen relative font-sans">
      {/* Mobile Top Nav */}
      <div className="md:hidden sticky top-0 w-full z-40 bg-brand-bg/80 backdrop-blur-md border-b border-brand-border">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-full flex items-center justify-center">
                <Logo className="h-8 w-auto object-contain" />
             </div>
             <span className="font-black uppercase tracking-tighter">Admin</span>
          </div>
          <button 
            className="p-2 rounded-full hover:bg-brand-text/5 text-brand-text-secondary"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-brand-text/60 z-45 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 left-0 h-[100dvh] z-50 overflow-y-auto pb-24 md:pb-6
        w-72 border-r border-brand-border bg-brand-surface pt-12 p-6 flex flex-col gap-2
        transition-transform duration-500 ease-in-out md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg bg-black/15">
            <Logo className="h-10 w-auto object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter leading-none">Plugsy</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-accent">Control Panel</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {sidebarLinks.map(link => (
            <button
              key={link.id}
              onClick={() => handleTabChange(link.id)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 font-bold uppercase tracking-widest text-[10px] relative ${
                activeTab === link.id 
                  ? 'bg-brand-accent text-white shadow-[0_8px_24px_rgba(0,102,255,0.25)]' 
                  : 'text-brand-text-secondary hover:bg-brand-text/5 hover:text-brand-text'
              }`}
            >
              <link.icon size={18} />
              {link.label}
              {link.id === 'chats' && stats.needsAttention > 0 && (
                <span className="absolute top-2 right-2 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[8px] items-center justify-center text-white">{stats.needsAttention}</span>
                </span>
              )}
            </button>
          ))}
          <Link
            to="/admin/portfolio-sales"
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-[background-color,color] duration-300 font-bold uppercase tracking-widest text-[10px] text-brand-text-secondary hover:bg-brand-text/5 hover:text-brand-text mt-1"
          >
            <DollarSign size={18} />
            Portfolio Sales
          </Link>
          <Link
            to="/admin/broadcast"
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-[background-color,color] duration-300 font-bold uppercase tracking-widest text-[10px] text-brand-text-secondary hover:bg-brand-text/5 hover:text-brand-text mt-1"
          >
            <Megaphone size={18} />
            Broadcast Notifications
          </Link>
        </nav>

        <div className="mt-8 pt-8 border-t border-brand-border space-y-2">
          <Link
            to="/dashboard"
            className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-brand-text-secondary hover:bg-brand-text/5 hover:text-brand-text font-bold uppercase tracking-widest text-[10px] transition-all"
          >
            <ExternalLink size={18} />
            My Dashboard
          </Link>
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-red-500 hover:bg-red-500/10 font-bold uppercase tracking-widest text-[10px] transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 overflow-x-hidden pt-12">
        <div className="flex justify-end mb-8">
           <div className="px-4 py-2 bg-brand-text/5 border border-brand-border rounded-full flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.5s_infinite]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Cloud Pulse Active — Real-time Sync</span>
           </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'pending' && (
              <div className="space-y-8">
                <header>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Pending Queue</h2>
                  <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                    Awaiting Fulfillment (logins delivery)
                    <button onClick={fetchAll} className="hover:text-brand-accent p-1 transition-colors"><RefreshCw size={14}/></button>
                  </p>
                </header>

                <div className="overflow-x-auto rounded-[2rem] border border-brand-border bg-brand-surface shadow-xl">
                  <table className="w-full text-left">
                    <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                      <tr className="text-[10px] font-black uppercase tracking-widest">
                        <th className="p-6">User</th>
                        <th className="p-6">Product</th>
                        <th className="p-6">Status</th>
                        <th className="p-6 text-right">Fulfillment Protocol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      {(() => {
                        if (loading && orders.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-20 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-70">
                                  <Loader2 size={48} className="animate-spin text-brand-accent mb-2" />
                                  <p className="uppercase font-black tracking-widest text-sm">Loading pending orders...</p>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        if (fetchErrors['admin_all_orders'] || fetchErrors['orders']) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-20 text-center">
                                <div className="flex flex-col items-center gap-4 text-red-500">
                                  <AlertCircle size={48} className="mb-2" />
                                  <p className="uppercase font-black tracking-widest text-sm">Error Loading Queue</p>
                                  <p className="text-xs opacity-80">Failed to sync with orders node.</p>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        const queue = safeArray(pendingQueue);
                        if (queue.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-20 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-40">
                                  <Clock size={48} className="text-brand-text-secondary mb-2" />
                                  <p className="text-brand-text-secondary uppercase font-black tracking-widest text-sm">No pending logins yet.</p>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        return queue.sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map(order => (
                          <React.Fragment key={order.id}>
                            <tr className="hover:bg-brand-text/5 transition-colors">
                              <td className="p-6">
                                <div className="font-bold text-sm">{order.user_email || 'N/A'}</div>
                                {order.purchase_code_used && (
                                  <div className="text-[10px] text-brand-accent mt-1">Code: {order.purchase_code_used}</div>
                                )}
                                <div className="text-[10px] text-brand-text-secondary mt-1 tracking-widest">{formatDate(order.created_at)}</div>
                              </td>
                              <td className="p-6">
                                <div className="text-xs font-black uppercase opacity-60">{order.product_name || 'Premium Plan'}</div>
                                <div className="text-[10px] font-medium text-brand-text-secondary">{order.plan_duration || 'Duration'}</div>
                                <div className="text-[10px] font-bold mt-1 text-green-500">{formatCurrency(order.amount)}</div>
                              </td>
                              <td className="p-6">
                                <div className="flex flex-col gap-1 items-start">
                                  <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-green-500/10 text-green-500">
                                    {formatStatus(order.payment_status || order.status || 'PAID')}
                                  </span>
                                  <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-orange-500/10 text-orange-500">
                                    {formatStatus(order.delivery_status || 'PENDING LOGINS')}
                                  </span>
                                </div>
                              </td>
                              <td className="p-6 text-right">
                                {order.paystack_ref || order.order_reference ? (
                                  <div className="text-[9px] font-mono text-brand-text-secondary mb-2">Ref: {order.paystack_ref || order.order_reference}</div>
                                ) : null}
                                <Link to={`/admin/chats?user_id=${order.user_id}`} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-accent hover:underline">
                                  Open Chat <ChevronRight size={14} />
                                </Link>
                              </td>
                            </tr>
                            <tr className="bg-brand-accent/5">
                              <td colSpan={4} className="p-4 pl-6">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mb-2">
                                  Send {order.product_name || "Product"} Login Details
                                </label>
                                <div className="flex flex-col gap-2">
                                  <div className="flex gap-4">
                                    <textarea 
                                      placeholder={`Paste ${order.product_name || "Product"} login/access details here...`}
                                      className="flex-1 bg-brand-surface border border-brand-border rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-brand-accent transition-all resize-y min-h-[48px]"
                                      value={loginsInput[order.id] || ''}
                                      onChange={(e) => setLoginsInput({...loginsInput, [order.id]: e.target.value})}
                                      rows={2}
                                    />
                                    <ScaleButton 
                                      onClick={() => handleSendLogins(order)}
                                      disabled={sendingLogins[order.id]}
                                      className={`px-8 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg whitespace-nowrap self-stretch flex items-center justify-center ${sendingLogins[order.id] ? 'bg-brand-text/10 text-brand-text-secondary cursor-not-allowed' : 'bg-brand-accent text-white hover:scale-105 active:scale-95 shadow-brand-accent/20'}`}
                                    >
                                      {sendingLogins[order.id] ? '🚀 Sending...' : 'Send Login'}
                                    </ScaleButton>
                                  </div>
                                  <p className="text-[10px] font-medium text-brand-text-secondary opacity-70">
                                    This will send the login details to the user’s chat and activate their subscription.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {activeTab === 'overview' && (
              <div className="space-y-12">
                <header>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Metrics</h2>
                  <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">System Pulse & Performance</p>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { icon: UsersIcon, label: 'Total Users', val: dbStats.loading ? '...' : (dbStats.totalUsers || 0).toLocaleString(), color: 'text-blue-500' },
                      { icon: CreditCard, label: 'Volume (Paid)', val: '₦' + (dbStats.combinedRevenue || 0).toLocaleString(), color: 'text-green-500', isRevenue: true },
                      { icon: Crown, label: 'Active Subs', val: (dbStats.activeSubs || 0).toLocaleString(), color: 'text-brand-accent', tab: 'subscriptions' },
                      { icon: Clock, label: 'Pending Orders', val: (dbStats.pendingOrders || 0).toLocaleString(), color: 'text-orange-500', tab: 'pending' },
                      { icon: MessageSquare, label: 'Open Chats', val: stats.openChats.toLocaleString(), color: 'text-indigo-500', tab: 'chats' },
                      { icon: AlertCircle, label: 'Action Required', val: stats.needsAttention.toLocaleString(), color: 'text-red-500', tab: 'chats' },
                      { icon: Inbox, label: 'Total Orders', val: (dbStats.totalOrders || 0).toLocaleString(), color: 'text-brand-text-secondary' },
                      { icon: XCircle, label: 'Expired/Ended', val: (dbStats.expiredSubs || 0).toLocaleString(), color: 'text-brand-text-secondary' }
                    ].map((stat, i) => (
                    <button 
                      key={i} 
                      onClick={() => stat.tab && setActiveTab(stat.tab as any)}
                      className={`card-premium p-6 flex flex-col group text-left transition-all hover:scale-[1.02] ${stat.tab ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="w-10 h-10 rounded-2xl bg-brand-text/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <stat.icon size={20} className={stat.color} />
                      </div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-text-secondary mb-1">{stat.label}</h3>
                      <p className="text-3xl font-black tracking-tighter text-brand-text">{stat.val}</p>
                      {stat.isRevenue && (
                        <div className="mt-2 text-[10px] font-bold text-brand-text-secondary leading-normal uppercase space-y-0.5">
                          <div>Subscriptions: ₦{(dbStats.totalRevenue || 0).toLocaleString()}</div>
                          <div>Portfolios: ₦{(dbStats.portfolioRevenue || 0).toLocaleString()}</div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                  <div className="card-premium p-8 lg:col-span-2">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xs font-black uppercase tracking-widest">Video Storage</h3>
                      <span className="text-[10px] font-black text-brand-text-secondary uppercase tracking-widest">Verification Engine Support</span>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-brand-surface rounded-2xl border border-brand-border">
                       <div>
                          <p className="text-xs font-bold text-white mb-1">Daily upload limit: 500 videos</p>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                  <div className="card-premium p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xs font-black uppercase tracking-widest">Recent Orders</h3>
                      <button onClick={() => handleTabChange('orders')} className="text-[10px] font-black text-brand-accent uppercase tracking-widest hover:underline">View All</button>
                    </div>
                    <div className="space-y-4">
                      {safeArray(orders).filter(o => !o.product_name?.toLowerCase().includes("medal")).sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 5).map(o => (
                        <div key={o.id} className="flex items-center justify-between p-4 bg-brand-text/5 rounded-2xl border border-brand-border">
                          <div>
                            <p className="text-xs font-black uppercase truncate max-w-[150px]">{o.user_email || 'N/A'}</p>
                            <p className="text-[10px] text-brand-text-secondary">{o.plan_duration || 'Plan'} - {formatCurrency(o.amount)}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                            (o.status === 'confirmed' || o.status === 'paid' || o.payment_status === 'paid') ? 'bg-green-500/10 text-green-500' : 'bg-brand-text/10 text-brand-text-secondary'
                          }`}>
                            {formatStatus(o.payment_status || o.status)}
                          </span>
                        </div>
                      ))}
                      {safeArray(orders).length === 0 && (
                        <p className="text-center py-6 text-[10px] uppercase font-black text-brand-text-secondary opacity-50">No orders yet</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="card-premium p-8">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xs font-black uppercase tracking-widest">Active Subscriptions</h3>
                      <button onClick={() => handleTabChange('subscriptions')} className="text-[10px] font-black text-brand-accent uppercase tracking-widest hover:underline">View All</button>
                    </div>
                    <div className="space-y-4">
                      {subscriptions.filter(s => s.status === 'active').sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5).map(s => {
                        const relatedOrder = orders.find(o => o.id === s.order_id);
                        return (
                        <div key={s.id} className="flex items-center justify-between p-4 bg-brand-text/5 rounded-2xl border border-brand-border">
                          <div>
                            <p className="text-xs font-black uppercase">{relatedOrder?.product_name || 'Premium Plan'}</p>
                            <p className="text-[10px] text-brand-text-secondary">Expires: {new Date(s.ends_at).toLocaleDateString()}</p>
                          </div>
                          <Clock size={14} className="text-brand-accent" />
                        </div>
                      )})}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-8">
                {fetchErrors['profiles'] ? (
                  <div className="card-premium p-20 text-center flex flex-col items-center justify-center gap-6">
                    <AlertCircle size={48} className="text-red-500" />
                    <p className="font-black uppercase tracking-widest text-sm text-brand-text">Users Node Sync Failed</p>
                    <LiquidGlass button chromaticAberration={2} onClick={fetchAll} className="btn-primary h-12 px-8 flex items-center gap-2">
                       <RefreshCw size={16} /> Retry Load
                    </LiquidGlass>
                  </div>
                ) : (
                  <>
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Users</h2>
                    <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Platform Population Control</p>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search users..." 
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="bg-brand-surface border border-brand-border rounded-2xl pl-12 pr-6 h-14 text-xs font-bold focus:ring-2 focus:ring-brand-accent/20 w-full md:w-64" 
                      />
                    </div>
                    <select 
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value as any)}
                      className="bg-brand-surface border border-brand-border rounded-2xl px-6 h-14 text-xs font-bold focus:ring-2 focus:ring-brand-accent/20"
                    >
                      <option value="all">All Roles</option>
                      <option value="user">Users</option>
                      <option value="admin">Admins</option>
                    </select>
                  </div>
                </header>

                {/* ADMINS LIST (BUG 2) */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-brand-accent/5 p-4 rounded-2xl border border-brand-accent/10">
                    <h3 className="text-xs font-black uppercase tracking-widest text-brand-accent">✦ Registered Administrators ({admins.length})</h3>
                  </div>
                  <div className="overflow-x-auto rounded-[2rem] border border-brand-border bg-brand-surface shadow-xl">
                    <table className="w-full text-left">
                      <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                        <tr className="text-[10px] font-black uppercase tracking-[0.2em]">
                          <th className="p-6">Administrator Identity</th>
                          <th className="p-6">Role Signature</th>
                          <th className="p-6">Joined Node</th>
                          <th className="p-6">Last Handshake</th>
                          <th className="p-6">Clerk Auth ID</th>
                          <th className="p-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {admins.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-12 text-center text-brand-text-secondary uppercase font-black tracking-widest text-xs">
                              No administrators recorded in nodes database.
                            </td>
                          </tr>
                        ) : admins.map(u => (
                          <tr key={u.id} className="hover:bg-brand-text/5 transition-colors group">
                            <td className="p-6">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-brand-accent/10 flex items-center justify-center font-black text-brand-accent uppercase overflow-hidden relative">
                                  {u.imageUrl ? (
                                    <img 
                                      src={optimizeCloudinaryUrl(u.imageUrl)} 
                                      loading="lazy"
                                      alt="" 
                                      className="w-full h-full object-cover" 
                                      referrerPolicy="no-referrer" 
                                    />
                                  ) : (
                                    u.full_name?.[0] || 'A'
                                  )}
                                </div>
                                <div>
                                  <p className="font-black truncate max-w-[200px]">{u.full_name || 'Admin Node'}</p>
                                  <p className="text-[10px] text-brand-text-secondary font-medium">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-6">
                              <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-brand-accent text-white shadow-lg shadow-brand-accent/20 border border-brand-accent/30">
                                {u.role}
                              </span>
                            </td>
                            <td className="p-6 text-[10px] font-black tracking-widest uppercase text-brand-text-secondary">
                              {formatDate(u.created_at)}
                            </td>
                            <td className="p-6 text-[10px] font-black tracking-widest uppercase text-brand-text-secondary">
                              {u.last_login_at ? formatDate(u.last_login_at) : 'Never'}
                            </td>
                            <td className="p-6 text-[10px] font-mono text-brand-text-secondary uppercase opacity-40">{u.clerk_id}</td>
                            <td className="p-6 text-right">
                              <div className="flex items-center justify-end gap-2 text-xs">
                                <Link to={`/admin/chats?userId=${u.id}`} className="p-2 hover:bg-brand-accent hover:text-white rounded-lg transition-all text-brand-text-secondary" title="Direct Chat"><MessageSquare size={16} /></Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* MEMBERS SECTION (BUG 2) */}
                <div className="space-y-4 pt-4">
                  <div className="flex justify-between items-center bg-brand-text/5 p-4 rounded-2xl border border-brand-border">
                    <h3 className="text-xs font-black uppercase tracking-widest text-brand-text">✦ Latest Registered Members / Users ({filteredUsers.length})</h3>
                  </div>
                  <div className="overflow-x-auto rounded-[2rem] border border-brand-border bg-brand-surface shadow-xl">
                    <table className="w-full text-left">
                      <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                        <tr className="text-[10px] font-black uppercase tracking-[0.2em]">
                          <th className="p-6">User Identity</th>
                          <th className="p-6">Role</th>
                          <th className="p-6">Joined</th>
                          <th className="p-6">Last Login</th>
                          <th className="p-6">Clerk Auth ID</th>
                          <th className="p-6 text-right">Activity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-20 text-center">
                              <div className="flex flex-col items-center gap-4 opacity-40">
                                <UsersIcon size={48} className="text-brand-text-secondary mb-2" />
                                <p className="text-brand-text-secondary uppercase font-black tracking-widest text-sm">No users found yet</p>
                                <p className="text-[10px] font-bold text-brand-text-secondary max-w-xs uppercase leading-relaxed">
                                  Users will appear here once they sign up or log in.
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : filteredUsers.map(u => (
                          <tr key={u.id} className="hover:bg-brand-text/5 transition-colors group">
                            <td className="p-6">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-brand-accent/10 flex items-center justify-center font-black text-brand-accent uppercase overflow-hidden relative">
                                  {u.imageUrl ? (
                                    <img 
                                      src={optimizeCloudinaryUrl(u.imageUrl)} 
                                      loading="lazy"
                                      alt="" 
                                      className="w-full h-full object-cover" 
                                      referrerPolicy="no-referrer" 
                                    />
                                  ) : (
                                    u.full_name?.[0] || 'U'
                                  )}
                                  {chats.some(c => (c.user_id === u.clerk_id || c.userId === u.clerk_id) && c.needs_admin_attention) && (
                                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-brand-surface rounded-full"></span>
                                  )}
                                  {isUserOnline(u.clerk_id || u.id, u.last_login_at) && (
                                    <span 
                                      className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border border-brand-surface rounded-full shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse z-10"
                                      title="Online"
                                    />
                                  )}
                                </div>
                                <div>
                                  <p className="font-black truncate max-w-[200px]">{u.full_name || 'Unknown'}</p>
                                  <p className="text-[10px] text-brand-text-secondary font-medium">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-6">
                              <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/20' : 'bg-brand-text/10 text-brand-text-secondary'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="p-6">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black tracking-widest uppercase text-brand-text-secondary">{formatDate(u.created_at)}</p>
                                {u.created_at && (
                                  <p className="text-[8px] font-bold text-brand-text-secondary/50 uppercase">{new Date(u.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-6">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black tracking-widest uppercase text-brand-text-secondary">
                                  {u.last_login_at ? formatDate(u.last_login_at) : 'Never'}
                                </p>
                                {u.last_login_at && (
                                  <p className="text-[8px] font-bold text-brand-text-secondary/50 uppercase">{new Date(u.last_login_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-6 text-[10px] font-mono text-brand-text-secondary uppercase opacity-40">{u.clerk_id}</td>
                            <td className="p-6 text-right">
                               <div className="flex items-center justify-end gap-2 text-xs">
                                 <button className="p-2 hover:bg-brand-accent hover:text-white rounded-lg transition-all text-brand-text-secondary" title="View Details"><TrendingUp size={16} /></button>
                                 <Link to={`/admin/chats?userId=${u.id}`} className="p-2 hover:bg-brand-accent hover:text-white rounded-lg transition-all text-brand-text-secondary" title="Direct Chat"><MessageSquare size={16} /></Link>
                                 <button 
                                   onClick={() => handleDeleteUser(u.id, u.email)}
                                   className="p-2 hover:bg-red-500 hover:text-white rounded-lg transition-all text-brand-text-secondary" 
                                   title="Delete Profile"
                                 >
                                   <Trash2 size={16} />
                                 </button>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                </>
                )}
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="space-y-8">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div>
                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">All Orders</h2>
                    <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">All Recorded Order Transmissions</p>
                  </div>
                </header>

                <div className="overflow-x-auto rounded-[2rem] border border-brand-border bg-brand-surface shadow-xl">
                  <table className="w-full text-left">
                    <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                      <tr className="text-[10px] font-black uppercase tracking-widest">
                        <th className="p-6">User Email</th>
                        <th className="p-6">Purchase Code Used</th>
                        <th className="p-6">Reward Status</th>
                        <th className="p-6">Order Reference</th>
                        <th className="p-6">Status</th>
                        <th className="p-6 text-right">Protocol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      {(() => {
                        const allOrders = safeArray(orders).filter(o => 
                          !o.product_name?.toLowerCase().includes("medal")
                        );
                        if (allOrders.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-20 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-40">
                                  <CreditCard size={48} className="text-brand-text-secondary mb-2" />
                                  <p className="text-brand-text-secondary uppercase font-black tracking-widest text-sm">No transmissions detected</p>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        return allOrders.sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map(order => (
                          <React.Fragment key={order.id}>
                            <tr className="hover:bg-brand-text/5 transition-colors group">
                               <td className="p-6">
                                  <div className="font-bold text-sm truncate max-w-[200px]">{order.user_email || 'N/A'}</div>
                                  <div className="text-[10px] text-brand-text-secondary mt-1">{formatDate(order.created_at)}</div>
                               </td>
                               <td className="p-6">
                                 <div className="text-xs font-black uppercase text-brand-text-secondary/70">{order.product_name || 'Premium Plan'}</div>
                                 <div className="text-[10px] font-bold text-green-500 mt-1">{formatCurrency(order.amount)}</div>
                               </td>
                               <td className="p-6">
                                 <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                   order.reward_status === 'earned' ? 'bg-green-500/10 text-green-500' : 
                                   order.reward_status === 'failed' ? 'bg-red-500/10 text-red-500' :
                                   'bg-brand-text/10 text-brand-text-secondary'
                                 }`}>
                                   {formatStatus(order.reward_status || 'NONE')}
                                 </span>
                               </td>
                               <td className="p-6 font-mono text-[10px] text-brand-text-secondary tracking-widest">{order.paystack_ref || order.order_reference || 'N/A'}</td>
                               <td className="p-6">
                                 <div className="flex flex-col gap-1 items-start">
                                   <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                     order.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                                     order.status === 'paid' ? 'bg-blue-500/10 text-blue-500' : 
                                     order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                                     order.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                                     'bg-brand-text/10 text-brand-text-secondary'
                                   }`}>
                                     {formatStatus(order.status || 'PENDING')}
                                   </span>
                                   <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                     order.delivery_status === 'delivered' ? 'bg-green-500/10 text-green-500' :
                                     order.delivery_status === 'login_sent' ? 'bg-blue-500/10 text-blue-500' :
                                     order.delivery_status === 'pending_login' ? 'bg-orange-500/10 text-orange-500' :
                                     'bg-brand-text/10 text-brand-text-secondary opacity-60'
                                   }`}>
                                      {order.delivery_status === 'login_sent' ? 'LOGIN SENT' : order.delivery_status === 'pending_login' ? 'PENDING LOGIN' : formatStatus(order.delivery_status || 'NOT PROVISIONED')}
                                   </span>
                                 </div>
                               </td>
                               <td className="p-6 text-right">
                                 <div className="flex flex-col sm:flex-row justify-end gap-2 text-xs">
                                     <Link to={`/admin/chats?user_id=${order.user_id}`} className="h-10 px-4 flex items-center justify-center bg-brand-text/5 hover:bg-brand-accent hover:text-white rounded-xl transition-all text-brand-text-secondary shadow-sm font-black uppercase text-[9px] tracking-widest whitespace-nowrap">
                                       <MessageSquare size={14} className="mr-1" /> Chat
                                     </Link>
                                   <button 
                                     onClick={() => handleDeleteOrder(order.id)}
                                     className="h-10 w-full sm:w-auto px-4 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 text-brand-text-secondary rounded-xl transition-all shadow-sm"
                                     title="Delete Order"
                                   >
                                     <Trash2 size={16} />
                                   </button>
                                 </div>
                               </td>
                            </tr>
                          </React.Fragment>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'medals' && (
              <div className="space-y-8">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div>
                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Medal Orders</h2>
                    <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Tracking users with premium status</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="card-premium px-6 py-3 flex items-center gap-3">
                      <Award size={20} className="text-brand-accent" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Medals Sold</p>
                        <p className="text-xl font-black">{safeArray(orders).filter(o => o.product_name?.toLowerCase().includes("medal")).length}</p>
                      </div>
                    </div>
                  </div>
                </header>

                <div className="overflow-x-auto rounded-[2rem] border border-brand-border bg-brand-surface shadow-xl">
                  <table className="w-full text-left">
                    <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                      <tr className="text-[10px] font-black uppercase tracking-widest">
                        <th className="p-6">User / Member</th>
                        <th className="p-6">Medal Tier</th>
                        <th className="p-6">Purchase Price</th>
                        <th className="p-6">Reference</th>
                        <th className="p-6">Order Status</th>
                        <th className="p-6 text-right">Member Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      {(() => {
                        const medalOrders = safeArray(orders).filter(o => 
                          o.product_name?.toLowerCase().includes("medal")
                        );
                        if (medalOrders.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="p-20 text-center">
                                <div className="flex flex-col items-center gap-4 opacity-40">
                                  <Award size={48} className="text-brand-text-secondary mb-2" />
                                  <p className="text-brand-text-secondary uppercase font-black tracking-widest text-sm">No medal purchases found</p>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        return medalOrders.sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map(order => {
                          const userProfile = allUsers.find(u => u.clerk_id === order.user_id || u.id === order.user_id);
                          return (
                            <tr key={order.id} className="hover:bg-brand-text/5 transition-colors group">
                               <td className="p-6">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-brand-text/5 flex items-center justify-center font-bold text-xs">
                                      {userProfile?.full_name?.[0] || order.user_email?.[0] || '?'}
                                    </div>
                                    <div>
                                      <div className="font-bold text-sm">{userProfile?.full_name || order.user_email || 'N/A'}</div>
                                      <div className="text-[10px] text-brand-text-secondary">{formatDate(order.created_at)}</div>
                                    </div>
                                  </div>
                               </td>
                               <td className="p-6">
                                 <div className={cn(
                                   "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                   order.product_name.includes("Gold") ? "bg-amber-400/10 text-amber-500 border border-amber-400/30" :
                                   order.product_name.includes("Silver") ? "bg-slate-400/10 text-slate-400 border border-slate-400/30" :
                                   "bg-orange-500/10 text-orange-500 border border-orange-500/30"
                                 )}>
                                   <Award size={12} />
                                   {order.product_name?.replace("Plugsy ", "").replace(" Medal", "").toUpperCase() || "MEDAL"}
                                 </div>
                               </td>
                               <td className="p-6">
                                 <div className="text-xs font-bold">{formatCurrency(order.amount)}</div>
                               </td>
                               <td className="p-6 font-mono text-[10px] text-brand-text-secondary opacity-60">
                                 {order.paystack_ref || order.order_reference || 'N/A'}
                               </td>
                               <td className="p-6">
                                 <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                   (order.status === 'completed' || order.status === 'paid' || order.status === 'success') ? 'bg-green-500/10 text-green-500' :
                                   order.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                                   'bg-red-500/10 text-red-500'
                                 }`}>
                                   {formatStatus(order.status || 'PENDING')}
                                 </span>
                               </td>
                               <td className="p-6 text-right">
                                  <Link to={`/admin/chats?user_id=${order.user_id}`} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-accent hover:underline">
                                    View Chat <ChevronRight size={14} />
                                  </Link>
                               </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'communities' && (
              <div className="space-y-12">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Communities</h2>
                    <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Global Group & Channel Audit</p>
                  </div>
                  <Link to="/admin/chats?type=group" className="h-14 px-8 rounded-2xl bg-brand-accent text-white font-black uppercase tracking-widest text-[10px] flex items-center gap-3 hover:scale-105 transition-all shadow-lg shadow-brand-accent/20">
                     <MessageSquare size={16} />
                     Full Community Interface
                  </Link>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {chats.filter(c => c.chat_type === 'group' || c.chat_type === 'channel').length === 0 ? (
                    <div className="card-premium p-20 text-center col-span-full opacity-40">
                      <UsersIcon size={48} className="text-brand-text-secondary mb-4 mx-auto" />
                      <p className="text-brand-text-secondary uppercase font-black tracking-widest text-sm">No communities discovered</p>
                    </div>
                  ) : (
                    chats.filter(c => c.chat_type === 'group' || c.chat_type === 'channel').map(community => (
                      <div key={community.id} className="card-premium p-8 group relative overflow-hidden">
                        <div className="flex items-center gap-6 mb-8">
                          <div className="w-16 h-16 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center overflow-hidden shrink-0">
                            {community.cover_image_url ? (
                              <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UsersIcon size={24} className="text-brand-accent" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xl font-black uppercase tracking-tighter truncate">{community.name || 'Unnamed Community'}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${community.chat_type === 'channel' ? 'bg-purple-500/10 text-purple-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                                {community.chat_type}
                              </span>
                              <span className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-widest">
                                {community.member_count || 0} Members
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <p className="text-xs font-medium text-brand-text-secondary line-clamp-2 mb-8 h-8">
                          {community.description || "No description provided for this protocol."}
                        </p>

                        <div className="flex items-center justify-between pt-6 border-t border-brand-border">
                          <div className="text-[9px] font-black uppercase tracking-widest text-brand-text-secondary/40">
                            Signal: {formatDate(community.last_message_at || community.created_at)}
                          </div>
                          <Link 
                            to={`/admin/chats?chat_type=${community.chat_type}&id=${community.id}`}
                            className="text-[10px] font-black uppercase tracking-widest text-brand-accent hover:underline flex items-center gap-2"
                          >
                            Open Chat <ChevronRight size={14} />
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {activeTab === 'chats' && (
              <div className="space-y-8">
                {fetchErrors['chats'] ? (
                  <div className="card-premium p-20 text-center flex flex-col items-center justify-center gap-6">
                    <AlertCircle size={48} className="text-red-500" />
                    <p className="font-black uppercase tracking-widest text-sm text-brand-text">Support Stream Interrupted</p>
                    <LiquidGlass button chromaticAberration={2} onClick={fetchAll} className="btn-primary h-12 px-8 flex items-center gap-2">
                       <RefreshCw size={16} /> Refresh Tab
                    </LiquidGlass>
                  </div>
                ) : (
                  <>
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Support</h2>
                    <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Real-time Transmission Audit</p>
                  </div>
                  <Link to="/admin/chats" className="h-14 px-8 rounded-2xl bg-brand-accent text-white font-black uppercase tracking-widest text-[10px] flex items-center gap-3 hover:scale-105 transition-all shadow-lg shadow-brand-accent/20">
                     <ExternalLink size={16} />
                     Full Support Interface
                  </Link>
                </header>

                {chats.filter(c => c.needs_admin_attention).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {chats.filter(c => c.needs_admin_attention).map(chat => (
                      <Link 
                        key={chat.id} 
                        to={`/admin/chats?order_id=${chat.order_id || chat.orderId}`}
                        className="card-premium p-6 hover:bg-brand-text/5 transition-all group relative"
                      >
                         <div className="absolute top-4 right-4 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                         </div>
                         <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 flex items-center justify-center font-black text-brand-accent uppercase">
                               {(chat.user_email || chat.userEmail || 'User').charAt(0)}
                            </div>
                            <div className="min-w-0">
                               <p className="text-xs font-black truncate">{chat.user_email || chat.userEmail || 'Unknown'}</p>
                               <p className="text-[10px] text-brand-text-secondary font-medium tracking-widest uppercase">Needs Attention</p>
                            </div>
                         </div>
                         <p className="text-xs font-medium text-brand-text-secondary line-clamp-2 mb-4 group-hover:text-brand-text transition-colors italic">
                            "{chat.last_message || chat.lastMessage || 'User initiated a transmission...'}"
                         </p>
                         <div className="flex items-center justify-between pt-4 border-t border-brand-border">
                            <span className="text-[9px] font-black uppercase tracking-widest text-brand-text-secondary/40">
                               {new Date(chat.last_message_at || chat.lastMessageAt || 0).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-brand-accent flex items-center gap-2">
                               Audit Chat <ChevronRight size={12} />
                            </span>
                         </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="card-premium p-20 text-center flex flex-col items-center justify-center opacity-40">
                    <ShieldCheck size={48} className="text-brand-text-secondary mb-4" />
                    <p className="text-brand-text-secondary uppercase font-black tracking-widest text-sm">All transmissions cleared</p>
                    <p className="text-[10px] font-bold text-brand-text-secondary max-w-xs uppercase leading-relaxed mt-2">
                      No active transmissions require immediate admin attention at this node.
                    </p>
                  </div>
                )}

                <div className="pt-12 border-t border-brand-border">
                   <h3 className="text-xs font-black uppercase tracking-widest mb-6">Recent Channels</h3>
                   <div className="overflow-x-auto rounded-[2rem] border border-brand-border bg-brand-surface shadow-xl">
                      <table className="w-full text-left">
                        <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                          <tr className="text-[10px] font-black uppercase tracking-widest">
                            <th className="p-6">User</th>
                            <th className="p-6">Last Signal</th>
                            <th className="p-6">Status</th>
                            <th className="p-6 text-right">Protocol</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border">
                          {chats.sort((a,b) => new Date(b.last_message_at || b.lastMessageAt || 0).getTime() - new Date(a.last_message_at || a.lastMessageAt || 0).getTime()).slice(0, 10).map(chat => (
                            <tr key={chat.id} className="hover:bg-brand-text/5 transition-colors group">
                               <td className="p-6 font-bold text-sm">{chat.user_email || chat.userEmail || 'Unknown'}</td>
                               <td className="p-6 text-xs text-brand-text-secondary">{new Date(chat.last_message_at || chat.lastMessageAt || 0).toLocaleString()}</td>
                               <td className="p-6">
                                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${chat.status === 'open' ? 'bg-green-500/10 text-green-500' : 'bg-brand-text/10 text-brand-text-secondary'}`}>
                                     {chat.status}
                                  </span>
                               </td>
                               <td className="p-6 text-right">
                                  <Link to={`/admin/chats?order_id=${chat.order_id || chat.orderId}`} className="text-[10px] font-black text-brand-accent uppercase tracking-widest hover:underline">Launch Audit</Link>
                               </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
                </>
                )}
              </div>
            )}

            {activeTab === 'plans' && (
              <div className="space-y-12">
                {fetchErrors['plans'] ? (
                  <div className="card-premium p-20 text-center flex flex-col items-center justify-center gap-6">
                    <AlertCircle size={48} className="text-red-500" />
                    <p className="font-black uppercase tracking-widest text-sm text-brand-text">Pricing Protocol Failure</p>
                    <LiquidGlass button chromaticAberration={2} onClick={fetchAll} className="btn-primary h-12 px-8 flex items-center gap-2">
                       <RefreshCw size={16} /> Retry Load
                    </LiquidGlass>
                  </div>
                ) : (
                  <>
                <header className="flex items-center justify-between">
                  <div>
                    <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Plans</h2>
                    <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Global Product Registry</p>
                  </div>
                  <LiquidGlass button chromaticAberration={2} onClick={handleCreatePlan} className="btn-primary h-14 px-8 text-xs flex items-center gap-2">
                    <Stars size={16} /> Create Payload
                  </LiquidGlass>
                </header>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {plans.map(plan => (
                    <PlanEditor 
                      key={plan.id}
                      plan={plan}
                      onSave={handleUpdatePlan}
                      onDelete={handleDeletePlan}
                      onReactivate={handleReactivatePlan}
                    />
                  ))}
                </div>
                </>
                )}
              </div>
            )}

            {activeTab === 'subscriptions' && (
              <div className="space-y-12">
                <header>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Subscriptions</h2>
                  <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Provisioned Authority Monitoring</p>
                </header>
                {adminSubsLoading ? (
                  <div className="card-premium p-20 text-center flex flex-col items-center justify-center gap-6">
                    <Loader2 size={48} className="text-brand-accent animate-spin" />
                    <p className="font-black uppercase tracking-widest text-sm text-brand-text">Loading Subscriptions...</p>
                  </div>
                ) : adminSubscriptions.length === 0 ? (
                  <div className="card-premium p-20 text-center border-dashed">
                    <div className="flex flex-col items-center gap-4 opacity-40">
                      <Crown size={48} className="text-brand-text-secondary mb-2" />
                      <p className="text-brand-text-secondary uppercase font-black tracking-widest text-sm">No active subscriptions.</p>
                      <p className="text-[10px] font-bold text-brand-text-secondary max-w-xs uppercase">Subscriptions will appear here once orders are confirmed.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {adminSubscriptions.map(sub => {
                      const daysLeft = Math.ceil(
                        (new Date(sub.subscription_expires_at).getTime() - Date.now()) / 
                        (1000 * 60 * 60 * 24)
                      );
                      const isActive = daysLeft > 0;
                      
                      return (
                        <div key={sub.id} className="card-premium p-10 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 p-8 opacity-5">
                             <Crown size={80} />
                          </div>
                          <div className="space-y-8">
                            <div className="flex justify-between items-start">
                               <div>
                                  <div className={`text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2 ${isActive ? 'text-green-500' : 'text-red-500'}`}>
                                     <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                     {isActive ? 'ACTIVE' : 'EXPIRED'}
                                  </div>
                                  <h4 className="text-2xl font-black uppercase tracking-tighter mb-1 truncate max-w-[200px]">{sub.product_name || 'Premium Plan'}</h4>
                               </div>
                            </div>
                            
                            <div className="space-y-4 pt-6 border-t border-brand-border">
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-secondary">
                                  <span>Holder</span>
                                  <span className="text-brand-text font-black truncate max-w-[140px]">{sub.user_email || 'Unknown'}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-secondary">
                                  <span>Duration</span>
                                  <span className="text-brand-text font-black">{sub.plan_duration || 'N/A'}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-secondary">
                                  <span>Amount</span>
                                  <span className="text-brand-accent font-black">₦{Number(sub.amount || 0).toLocaleString()}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-secondary">
                                  <span>Activation</span>
                                  <span className="text-brand-text font-black">{formatDate(sub.subscription_started_at)}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-secondary">
                                  <span>Expiry</span>
                                  <span className="font-black">{formatDate(sub.subscription_expires_at)}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-secondary">
                                  <span>Days Left</span>
                                  <span className="font-black">{daysLeft}</span>
                               </div>
                               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-secondary">
                                  <span>Ref</span>
                                  <span className="text-brand-text font-mono truncate max-w-[120px]">{sub.order_reference}</span>
                               </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}


            {activeTab === 'financial' && (
              <div className="space-y-8">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-2">Financial Dashboard</h2>
                    <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                      Master Funds Control & Oversight
                      <button onClick={fetchFinancialData} className="hover:text-brand-accent p-1 transition-colors">
                        <RefreshCw size={14} className={financialLoading ? "animate-spin" : ""} />
                      </button>
                    </p>
                  </div>
                </header>

                {financialLoading && !financialData ? (
                  <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
                    <Loader2 size={48} className="animate-spin text-brand-accent mb-2" />
                    <p className="uppercase font-black tracking-widest text-sm text-brand-text-secondary">Loading financial ledgers...</p>
                  </div>
                ) : financialError ? (
                  <div className="py-20 text-center text-red-500 max-w-md mx-auto flex flex-col items-center justify-center gap-4 bg-brand-surface border border-red-500/20 rounded-2xl p-6">
                    <AlertCircle size={48} />
                    <p className="uppercase font-black tracking-widest text-sm">Failed to Sync Financial Ledger</p>
                    <p className="text-xs opacity-80">{financialError}</p>
                    <button onClick={fetchFinancialData} className="mt-4 px-4 py-2 bg-brand-accent text-white font-bold rounded-xl text-xs uppercase tracking-wider">Retry Sync</button>
                  </div>
                ) : (
                  <>
                    {/* Metrics row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 flex items-center justify-between shadow-lg">
                        <div>
                          <p className="text-brand-text-secondary text-xs font-bold uppercase tracking-wider mb-1">Total Platform Liquidity</p>
                          <h3 className="text-3xl font-black text-brand-text">
                            ₦{(financialData?.totalLiquidity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </h3>
                          <p className="text-[10px] text-brand-text-secondary mt-1">Aggregated sum of all user wallet balances</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-xl flex items-center justify-center">
                          <DollarSign size={24} />
                        </div>
                      </div>

                      <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 flex items-center justify-between shadow-lg">
                        <div>
                          <p className="text-brand-text-secondary text-xs font-bold uppercase tracking-wider mb-1">Pending Withdrawals</p>
                          <h3 className="text-3xl font-black text-brand-text text-yellow-500">
                            ₦{(financialData?.pendingFundingEstimate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </h3>
                          <p className="text-[10px] text-brand-text-secondary mt-1">Total value of {financialData?.transactions?.filter(t => t.type === 'withdraw' && t.status === 'pending').length || 0} currently pending payouts</p>
                        </div>
                        <div className="w-12 h-12 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-xl flex items-center justify-center">
                          <TrendingUp size={24} />
                        </div>
                      </div>
                    </div>

                    {/* Users Balances Section */}
                    <div className="space-y-4">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h3 className="text-xl font-bold uppercase tracking-tight">User Wallet Balances</h3>
                        <div className="relative w-full md:w-80">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-secondary" size={14} />
                          <input 
                            type="text" 
                            placeholder="Search balance by name or email..." 
                            value={financialSearch}
                            onChange={(e) => setFinancialSearch(e.target.value)}
                            className="bg-brand-text/5 border border-brand-border rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold w-full focus:ring-2 focus:ring-brand-accent/20 outline-none placeholder:text-brand-text-secondary/50"
                          />
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-brand-border bg-brand-surface">
                        <table className="w-full text-left">
                          <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                            <tr className="text-[10px] font-black uppercase tracking-widest">
                              <th className="p-4 pl-6">Name</th>
                              <th className="p-4">Email</th>
                              <th className="p-4">Created At</th>
                              <th className="p-4 text-right pr-6">Current Wallet Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border text-xs">
                            {financialData?.users && financialData.users.length > 0 ? (
                              (() => {
                                const filteredUsers = financialData.users.filter((u: any) => {
                                  const searchLower = financialSearch.toLowerCase();
                                  return (
                                    (u.full_name || '').toLowerCase().includes(searchLower) ||
                                    (u.email || '').toLowerCase().includes(searchLower)
                                  );
                                });
                                if (filteredUsers.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={4} className="p-8 text-center text-brand-text-secondary font-medium">
                                        No user balances found matching "{financialSearch}".
                                      </td>
                                    </tr>
                                  );
                                }
                                return filteredUsers.map((u: any) => (
                                  <tr key={u.id} className="hover:bg-brand-text/5 transition-colors">
                                    <td className="p-4 pl-6 font-bold text-brand-text">{u.full_name || 'N/A'}</td>
                                    <td className="p-4 text-brand-text-secondary">{u.email || 'N/A'}</td>
                                    <td className="p-4 text-brand-text-secondary">{new Date(u.created_at).toLocaleDateString()}</td>
                                    <td className="p-4 text-right font-black text-brand-text pr-6">
                                      ₦{(Number(u.balance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ));
                              })()
                            ) : (
                              <tr>
                                <td colSpan={4} className="p-8 text-center text-brand-text-secondary">No user balances found.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* General Transaction History */}
                    <div className="space-y-4">
                      <h3 className="text-xl font-bold uppercase tracking-tight">Unified Wallet Ledger</h3>
                      <div className="overflow-x-auto rounded-2xl border border-brand-border bg-brand-surface">
                        <table className="w-full text-left">
                          <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                            <tr className="text-[10px] font-black uppercase tracking-widest">
                              <th className="p-4 pl-6">User / Ref</th>
                              <th className="p-4">Type</th>
                              <th className="p-4">Amount</th>
                              <th className="p-4">Status</th>
                              <th className="p-4 pr-6 text-right">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border text-xs">
                            {financialData?.transactions && financialData.transactions.length > 0 ? (
                              financialData.transactions.map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-brand-text/5 transition-colors">
                                  <td className="p-4 pl-6">
                                    <div className="font-bold text-brand-text">{tx.user_email || 'N/A'}</div>
                                    <div className="text-[10px] text-brand-text-secondary font-mono mt-0.5">Ref: {tx.reference || 'N/A'}</div>
                                  </td>
                                  <td className="p-4">
                                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                      tx.type === 'fund' ? 'bg-green-500/10 text-green-500' :
                                      tx.type === 'withdraw' ? 'bg-red-500/10 text-red-500' :
                                      'bg-blue-500/10 text-blue-500'
                                    }`}>
                                      {tx.type}
                                    </span>
                                  </td>
                                  <td className="p-4 font-bold text-brand-text">
                                    ₦{(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-4">
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                                        tx.status === 'success' ? 'bg-green-500/10 text-green-500' :
                                        tx.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                                        'bg-red-500/10 text-red-500'
                                      }`}>
                                        {tx.status}
                                      </span>
                                      {tx.status === 'pending' && (
                                        <div className="flex gap-1.5">
                                          <button
                                            onClick={async () => {
                                              if (window.confirm("Mark this pending payout as SUCCESS? This will clear it from the funding estimate.")) {
                                                await handleUpdateTxStatus(tx.id, 'success');
                                              }
                                            }}
                                            className="px-2 py-0.5 bg-green-500 hover:bg-green-600 text-white rounded text-[8px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                                          >
                                            Confirm Success
                                          </button>
                                          <button
                                            onClick={async () => {
                                              if (window.confirm("FAIL this pending payout? This will refund the amount + fee back to the user's wallet.")) {
                                                await handleUpdateTxStatus(tx.id, 'failed');
                                              }
                                            }}
                                            className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded text-[8px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                                          >
                                            Fail & Refund
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-4 text-right text-brand-text-secondary pr-6">
                                    {new Date(tx.created_at).toLocaleString()}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-brand-text-secondary">No transactions in ledger.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}



            {false && (
              <div className="space-y-8">
                {fetchErrors['withdrawals'] ? (
                  <div className="card-premium p-20 text-center flex flex-col items-center justify-center gap-6">
                    <AlertCircle size={48} className="text-red-500" />
                    <p className="font-black uppercase tracking-widest text-sm text-brand-text">Transaction Node Unreachable</p>
                    <LiquidGlass button chromaticAberration={2} onClick={fetchAll} className="btn-primary h-12 px-8 flex items-center gap-2">
                       <RefreshCw size={16} /> Refresh Tab
                    </LiquidGlass>
                  </div>
                ) : (
                  <>
                <header>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Withdrawals</h2>
                  <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Financial Requests</p>
                </header>

                <div className="flex gap-2 p-1 border border-brand-border bg-brand-surface rounded-xl overflow-x-auto w-fit">
                  <button 
                    onClick={() => setWithdrawalSubTab('pending')}
                    className={`px-8 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${withdrawalSubTab === 'pending' ? 'bg-brand-text text-brand-surface shadow-sm' : 'text-brand-text-secondary hover:text-brand-text'}`}
                  >Pending Queue</button>
                  <button 
                    onClick={() => setWithdrawalSubTab('history')}
                    className={`px-8 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${withdrawalSubTab === 'history' ? 'bg-brand-text text-brand-surface shadow-sm' : 'text-brand-text-secondary hover:text-brand-text'}`}
                  >History</button>
                </div>

                <div className="overflow-x-auto rounded-[2rem] border border-brand-border bg-brand-surface shadow-xl">
                  <table className="w-full text-left">
                    <thead className="border-b border-brand-border bg-brand-text/5 text-brand-text-secondary">
                      <tr className="text-[10px] font-black uppercase tracking-widest">
                        <th className="p-6">User</th>
                        <th className="p-6">Amount</th>
                        <th className="p-6">Bank Name</th>
                        <th className="p-6">Account Number</th>
                        <th className="p-6">Account Name</th>
                        <th className="p-6">Status</th>
                        {withdrawalSubTab === 'pending' && <th className="p-6 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border">
                      {safeArray(withdrawals).filter(w => withdrawalSubTab === 'pending' ? w.status === 'pending' : w.status !== 'pending').length === 0 ? (
                        <tr>
                          <td colSpan={withdrawalSubTab === 'pending' ? 7 : 6} className="p-20 text-center text-brand-text-secondary uppercase font-black tracking-widest text-sm">No withdrawals found</td>
                        </tr>
                      ) : safeArray(withdrawals).filter(w => withdrawalSubTab === 'pending' ? w.status === 'pending' : w.status !== 'pending').sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map(w => (
                         <tr key={w.id}>
                           <td className="p-6">
                              <div className="font-bold text-sm">{w.user_name || w.user_email || 'N/A'}</div>
                              <div className="text-[10px] text-brand-text-secondary mt-1">{w.user_email}</div>
                              <div className="text-[10px] text-brand-text-secondary mt-1">{formatDate(w.created_at)}</div>
                           </td>
                           <td className="p-6 font-black text-green-500">₦{Number(w.amount || 0).toLocaleString()}</td>
                           <td className="p-6 text-xs font-mono">{w.bank_name || 'N/A'}</td>
                           <td className="p-6 text-xs font-mono">{w.account_number || 'N/A'}</td>
                           <td className="p-6 text-xs font-mono">{w.account_name || 'N/A'}</td>
                           <td className="p-6">
                            <span className={`px-3 py-1 rounded-full text-[9px] uppercase font-black tracking-widest ${w.status === 'pending' ? 'bg-orange-500/10 text-orange-500' : 'bg-green-500/10 text-green-500'}`}>
                              {w.status}
                            </span>
                           </td>
                           {withdrawalSubTab === 'pending' && (
                             <td className="p-6 text-right">
                               <button 
                                 onClick={async () => {
                                    try {
                                      console.log("[admin] confirming withdrawal:", w.id);
                                      
                                      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co';
                                      const serviceKey = await Promise.resolve(import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY);
                                      const adminClient = serviceKey ? createClient(supabaseUrl, serviceKey as string, { auth: { persistSession: false } }) : supabase;

                                      const adminClerkUserId = user?.id || 'admin';
                                      
                                      // Step 1: Update withdrawal status
                                      const { error: updateErr } = await adminClient
                                        .from("withdrawals")
                                        .update({
                                          status: "confirmed",
                                          confirmed_by: adminClerkUserId,
                                          confirmed_at: new Date().toISOString()
                                        })
                                        .eq("id", w.id);

                                      console.log("[admin] withdrawal update error:", updateErr);

                                      if (updateErr) {
                                        toast.error("Failed to confirm: " + updateErr.message);
                                        return; // STOP here if update failed
                                      }
                                      
                                      // Step 2: Fetch user current balance
                                      const { data: userProfile, error: profileErr } = await adminClient
                                        .from("profiles")
                                        .select("balance")
                                        .eq("clerk_id", w.user_id)
                                        .single();
                                        
                                      console.log("[admin] user profile:", userProfile, profileErr);

                                      // Step 3: Deduct balance
                                      if (userProfile) {
                                        // Balance was already deducted immediately when withdrawal was requested to prevent double spending.
                                         const newBalance = userProfile.balance || 0;
                                        const { error: balanceErr } = await adminClient
                                          .from("profiles")
                                          .update({ balance: newBalance })
                                          .eq("clerk_id", w.user_id);

                                        console.log("[admin] balance update error:", balanceErr);
                                        if (balanceErr) {
                                          toast.error("Balance update failed: " + balanceErr.message);
                                          return;
                                        }
                                      }

                                      // Step 3b: Update corresponding wallet transaction status to success
                                      const { error: txErr } = await adminClient
                                        .from("wallet_transactions")
                                        .update({ status: "success", updated_at: new Date().toISOString() })
                                        .eq("user_id", w.user_id)
                                        .eq("type", "withdraw")
                                        .eq("amount", w.amount)
                                        .eq("status", "pending");

                                      if (txErr) {
                                        console.error("[admin] wallet transaction update error:", txErr);
                                      }

                                      // Step 4: Send confirmation message to user
                                      await adminClient.from("messages").insert({
                                        sender_id: "system",
                                        sender_role: "system",
                                        sender_name: "Plugsy",
                                        content: "✅ Your withdrawal of ₦" + 
                                                 Number(w.amount).toLocaleString() +
                                                 " to " + w.bank_name +
                                                 " (" + w.account_number + ") " +
                                                 "has been confirmed and processed. " +
                                                 "Allow 1-3 business days for transfer.",
                                        user_id: w.user_id,
                                        event: "withdrawal_confirmed",
                                        topic: "withdrawal",
                                        is_from_user: false,
                                        is_bot: true,
                                        is_bot_message: true,
                                        read_by_admin: true,
                                        read_by_user: false
                                      });

                                      // Step 5: Only remove from local state AFTER all updates succeed
                                      setWithdrawals(prev => prev.filter(wd => wd.id !== w.id));
                                      toast.success("Payment confirmed for " + (w.user_name || w.user_email || "User"));
                                      
                                      // Refetch withdrawals to stay in sync
                                      fetchWithdrawals();

                                    } catch (err) {
                                      console.error(err);
                                      toast.error("Failed to mark withdrawal paid.");
                                    }
                                 }}
                                 className="px-6 py-3 bg-green-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-green-500/20 whitespace-nowrap"
                               >
                                 Confirm Payment
                               </button>
                           </td>
                           )}
                         </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-12">
                {fetchErrors['site_settings'] ? (
                  <div className="card-premium p-20 text-center flex flex-col items-center justify-center gap-6">
                    <AlertCircle size={48} className="text-red-500" />
                    <p className="font-black uppercase tracking-widest text-sm text-brand-text">Configuration Payload Failed</p>
                    <LiquidGlass button chromaticAberration={2} onClick={fetchAll} className="btn-primary h-12 px-8 flex items-center gap-2">
                       <RefreshCw size={16} /> Refresh Tab
                    </LiquidGlass>
                  </div>
                ) : (
                  <>
                <header>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Protocol</h2>
                  <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Global Variable Adjustment</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="card-premium p-10 space-y-10">
                    <div className="flex items-center gap-4 mb-4">
                       <div className="p-4 bg-brand-accent rounded-2xl text-white shadow-lg shadow-brand-accent/20">
                          <SettingsIcon size={24} />
                       </div>
                       <div>
                          <h3 className="text-xl font-black uppercase tracking-tight">System</h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Global Variable Adjustment</p>
                       </div>
                    </div>

                    <form onSubmit={handleSaveConfig} className="space-y-8">
                       <div className="pt-4 space-y-8">
                          <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Fixed Reward (₦)</label>
                            <input name="pricePerReward" type="number" className="bg-brand-text/5 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold w-full focus:ring-2 focus:ring-brand-accent/20 outline-none" defaultValue={site_settings?.price_per_reward || 800} />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Withdrawal Threshold (₦)</label>
                            <input name="withdrawalThreshold" type="number" className="bg-brand-text/5 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold w-full focus:ring-2 focus:ring-brand-accent/20 outline-none" defaultValue={site_settings?.withdrawal_threshold || 1000} />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary" title="URL to redirect users for support, e.g. WhatsApp">Support Channel (WhatsApp/Link)</label>
                            <input name="supportWhatsApp" type="text" className="bg-brand-text/5 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold w-full focus:ring-2 focus:ring-brand-accent/20 outline-none" defaultValue={site_settings?.support_whatsapp} />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Operational Email</label>
                            <input name="supportEmail" type="text" className="bg-brand-text/5 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold w-full focus:ring-2 focus:ring-brand-accent/20 outline-none" defaultValue={site_settings?.support_email} />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Portfolio Setup Tutorial Video (Cloudinary/YouTube Link)</label>
                            <input name="portfolioTutorialUrl" type="text" className="bg-brand-text/5 border border-brand-border rounded-xl px-4 py-3 text-xs font-bold w-full focus:ring-2 focus:ring-brand-accent/20 outline-none" defaultValue={site_settings?.portfolio_tutorial_url || "https://res.cloudinary.com/doit6oaze/video/upload/v1782272301/VID-20260623-WA0147_h41hjz.mp4"} />
                          </div>
                       </div>

                       <LiquidGlass button chromaticAberration={2} type="submit" className="w-full btn-primary h-16 shadow-xl text-xs flex items-center justify-center gap-3">
                          <CheckCircle2 size={18} />
                          <span>Commit Changes</span>
                       </LiquidGlass>
                    </form>
                  </div>

                  <div className="space-y-8">
                     <div className="p-8 bg-brand-accent text-white rounded-[2.5rem] shadow-2xl shadow-brand-accent/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                           <ShieldCheck size={120} />
                        </div>
                        <h3 className="text-2xl font-black uppercase tracking-tighter mb-4">Security Notice</h3>
                        <p className="text-sm font-medium tracking-tight opacity-90 leading-relaxed mb-8">
                           Global variable updates are reflected across the network in real-time. Verify protocol parameters before committing.
                        </p>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-brand-card/20 px-4 py-2 rounded-full w-fit">
                           Protocol: AES-256 Validated
                        </div>
                     </div>

                     <div className="card-premium p-8 flex items-center justify-between">
                        <div>
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mb-1">Last Update</h4>
                           <p className="text-sm font-bold">{site_settings?.updated_at ? new Date(site_settings.updated_at).toLocaleString() : 'Never'}</p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-brand-text/5 flex items-center justify-center text-brand-accent">
                           <Calendar size={20} />
                        </div>
                     </div>
                  </div>
                </div>
                </>
                )}
              </div>
            )}

            {activeTab === 'broadcast' && (
              <div className="space-y-8">
                <header>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-2">Broadcast</h2>
                  <p className="text-brand-text-secondary font-bold uppercase tracking-widest text-xs">Reach all or specific users via Email</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="card-premium p-8 space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Email Subject</label>
                        <input 
                          type="text" 
                          value={broadcastSubject}
                          onChange={(e) => setBroadcastSubject(e.target.value)}
                          placeholder="e.g. Exciting updates for you! ✨"
                          className="w-full bg-brand-surface border border-brand-border rounded-xl h-14 px-6 text-sm font-bold focus:border-brand-accent transition-all" 
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary">Email Message / Body</label>
                        <p className="text-[10px] text-brand-text-secondary/60 font-medium italic mb-1">Type your email message below in normal text. It will be automatically formatted into a gorgeous, professional Plugsy email template.</p>
                        <textarea 
                          value={broadcastContent}
                          onChange={(e) => setBroadcastContent(e.target.value)}
                          placeholder="Write your email announcement or update here..."
                          rows={12}
                          className="w-full bg-brand-surface border border-brand-border rounded-xl p-6 text-sm font-semibold focus:border-brand-accent transition-all resize-y" 
                        />
                      </div>

                      <div className="pt-4">
                        <ScaleButton 
                          onClick={handleSendBroadcast}
                          disabled={sendingBroadcast}
                          className={`w-full h-16 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-xl ${
                            sendingBroadcast ? 'bg-brand-text/10 text-brand-text-secondary' : 'bg-brand-accent text-white hover:scale-105'
                          }`}
                        >
                          {sendingBroadcast ? (
                            <>
                              <Loader2 className="animate-spin" size={20} />
                              Transmitting Broadcast...
                            </>
                          ) : (
                            <>
                              <Mail size={20} />
                              Deploy Broadcast Now
                            </>
                          )}
                        </ScaleButton>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="card-premium p-8">
                      <h3 className="text-xs font-black uppercase tracking-widest mb-6">Targeting Strategy</h3>
                      <div className="space-y-4">
                        <button 
                          onClick={() => setBroadcastTarget('all')}
                          className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                            broadcastTarget === 'all' 
                              ? 'bg-brand-accent/5 border-brand-accent text-brand-accent' 
                              : 'bg-brand-text/5 border-brand-border text-brand-text-secondary hover:bg-brand-text/10'
                          }`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest">All Active Users</span>
                          <UsersIcon size={16} />
                        </button>
                        <button 
                          onClick={() => setBroadcastTarget('selected')}
                          className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                            broadcastTarget === 'selected' 
                              ? 'bg-brand-accent/5 border-brand-accent text-brand-accent' 
                              : 'bg-brand-text/5 border-brand-border text-brand-text-secondary hover:bg-brand-text/10'
                          }`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest">Selected Users Only</span>
                          <Filter size={16} />
                        </button>
                      </div>

                      {broadcastTarget === 'selected' && (
                        <div className="mt-8 space-y-4">
                          <div className="flex items-center justify-between mb-2">
                             <label className="text-[9px] font-black uppercase tracking-widest text-brand-text-secondary">Select Recipients ({selectedUserEmails.length})</label>
                             <button 
                               onClick={() => setSelectedUserEmails([])}
                               className="text-[9px] font-black uppercase text-brand-accent hover:underline"
                             >
                               Clear
                             </button>
                          </div>
                          
                          <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {users.map(u => {
                              const isSelected = selectedUserEmails.includes(u.email);
                              // Simple check for expired users to help with selection
                              const userSub = subscriptions.find(s => s.user_id === u.clerk_id);
                              const isExpired = userSub && (userSub.status !== 'active' || new Date(userSub.ends_at).getTime() <= Date.now());
                              
                              return (
                                <button
                                  key={u.id}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedUserEmails(prev => prev.filter(e => e !== u.email));
                                    } else {
                                      setSelectedUserEmails(prev => [...prev, u.email]);
                                    }
                                  }}
                                  className={`w-full p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                                    isSelected 
                                      ? 'bg-brand-accent text-white border-brand-accent' 
                                      : 'bg-brand-text/5 border-brand-border hover:bg-brand-text/10'
                                  }`}
                                >
                                  <div className="w-6 h-6 rounded-md bg-brand-text/10 flex items-center justify-center font-black text-[10px]">
                                    {u.full_name?.charAt(0) || 'U'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[9px] font-black uppercase truncate ${isSelected ? 'text-white' : 'text-brand-text'}`}>
                                      {u.full_name || 'Anonymous User'}
                                    </p>
                                    <p className={`text-[8px] font-bold truncate ${isSelected ? 'text-white/70' : 'text-brand-text-secondary'}`}>
                                      {u.email}
                                    </p>
                                  </div>
                                  {isExpired && !isSelected && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Subscription Expired" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <div className="pt-4 flex gap-2">
                             <button 
                               onClick={() => {
                                 const expiredEmails = users.filter(u => {
                                   const sub = subscriptions.find(s => s.user_id === u.clerk_id);
                                   return sub && (sub.status !== 'active' || new Date(sub.ends_at).getTime() <= Date.now());
                                 }).map(u => u.email).filter(Boolean);
                                 setSelectedUserEmails(expiredEmails);
                               }}
                               className="flex-1 p-2 bg-red-500/10 text-red-500 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                             >
                               Select Expired
                             </button>
                             <button 
                               onClick={() => {
                                 const subbedEmails = users.filter(u => {
                                   const sub = subscriptions.find(s => s.user_id === u.clerk_id);
                                   return sub && sub.status === 'active' && new Date(sub.ends_at).getTime() > Date.now();
                                 }).map(u => u.email).filter(Boolean);
                                 setSelectedUserEmails(subbedEmails);
                               }}
                               className="flex-1 p-2 bg-green-500/10 text-green-500 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-green-500/20 transition-all"
                             >
                               Select Active
                             </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
