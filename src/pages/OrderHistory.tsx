import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const SubscriptionTimer = ({ order }: { order: any }) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    const getTargetDate = () => {
      // Primary expiration column
      if (order.subscription_expires_at) {
        return new Date(order.subscription_expires_at);
      }
      
      // Secondary fallback base
      const baseDate = order.subscription_started_at 
        ? new Date(order.subscription_started_at) 
        : order.logins_sent_at 
          ? new Date(order.logins_sent_at) 
          : new Date(order.created_at);
      
      const months = Number(order.plan_months || 1);
      const target = new Date(baseDate.getTime());
      target.setMonth(target.getMonth() + months);
      return target;
    };

    const targetDate = getTargetDate();

    const updateTimer = () => {
      const now = new Date().getTime();
      const difference = targetDate.getTime() - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order]);

  if (timeLeft.isExpired) {
    return (
      <div className="flex items-center gap-1.5 mt-3 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase px-2.5 py-1 rounded-md w-fit">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Subscription Expired
      </div>
    );
  }

  // Beautiful status timer block
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3 p-3 bg-brand-accent/5 border border-brand-accent/15 rounded-xl text-xs w-full sm:w-fit">
      <div className="flex items-center gap-2 text-brand-text-secondary select-none font-bold uppercase tracking-wider text-[10px]">
        <Clock size={12} className="text-brand-accent animate-pulse" />
        Time Remaining:
      </div>
      <div className="flex items-center gap-1 font-mono font-bold text-white select-none">
        {timeLeft.days > 0 && (
          <>
            <span className="bg-brand-accent/20 px-2 py-0.5 rounded text-brand-accent text-[11px] font-black">{timeLeft.days}</span>
            <span className="text-[10px] text-brand-text-secondary pr-1 font-mono uppercase font-black">d</span>
          </>
        )}
        <span className="bg-brand-accent/20 px-2 py-0.5 rounded text-brand-accent text-[11px] font-black">{String(timeLeft.hours).padStart(2, '0')}</span>
        <span className="text-[10px] text-brand-text-secondary font-mono uppercase font-black">:</span>
        <span className="bg-brand-accent/20 px-2 py-0.5 rounded text-brand-accent text-[11px] font-black">{String(timeLeft.minutes).padStart(2, '0')}</span>
        <span className="text-[10px] text-brand-text-secondary font-mono uppercase font-black">:</span>
        <span className="bg-brand-accent/20 px-2 py-0.5 rounded text-brand-accent text-[11px] font-black">{String(timeLeft.seconds).padStart(2, '0')}</span>
      </div>
    </div>
  );
};

export default function OrderHistory() {
  const { userId } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function fetchOrders(retries = 1) {
      try {
        const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms));
        
        const executeFetch = async () => {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', String(userId))
            .in('status', ['paid', 'confirmed', 'completed', 'success', 'active'])
            .order('created_at', { ascending: false });

          if (error) throw error;
          if (typeof data === 'string' && (data as string).includes('<!doctype')) return [];
          return data || [];
        };

        const data = await Promise.race([executeFetch(), timeout(8000)]) as any[];
        setOrders(data);
      } catch (err: any) {
        console.error("Error fetching order history:", err);
        if (err.message === 'TIMEOUT' && retries > 0) {
          return fetchOrders(retries - 1);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, [userId]);

  return (
    <div className="min-h-screen bg-brand-bg px-4 py-12 md:py-24">
      <div className="max-w-7xl mx-auto">
        <Link to="/dashboard" className="text-brand-text-secondary hover:text-brand-accent flex items-center gap-2 mb-8 font-bold uppercase tracking-widest text-xs">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-12">Order History</h1>

        {loading ? (
          <div className="grid gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-white dark:bg-[#141416] border border-slate-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse"
              >
                <div className="space-y-2 flex-grow">
                  <div className="w-48 h-5 bg-slate-200 dark:bg-white/10 rounded" />
                  <div className="w-64 h-3.5 bg-slate-150 dark:bg-white/5 rounded" />
                </div>
                <div className="w-20 h-6 bg-slate-200 dark:bg-white/10 rounded-full" />
              </div>
            ))}
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-20 card-premium">No orders found.</div>
        ) : (
          <div className="grid gap-6">
            {orders.map((order) => {
              if (!order) return null;
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card-premium p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-brand-border"
                >
                  <div>
                    <h3 className="text-xl font-bold">{order.product_name}</h3>
                    <p className="text-sm text-brand-text-secondary font-mono">
                      {new Date(order.created_at).toLocaleDateString()} • Reference: {order.paystack_reference || 'N/A'}
                    </p>
                    {(order.payment_status === 'paid' || order.status === 'completed' || order.status === 'confirmed' || order.status === 'paid') && !order.product_name?.toLowerCase().includes('medal') && (
                      <SubscriptionTimer order={order} />
                    )}
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-bold text-lg">₦{order.amount?.toLocaleString() || '0'}</span>
                    
                    <div className="flex gap-2">
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        (order.payment_status === 'paid' || order.status === 'completed' || order.status === 'confirmed' || order.status === 'paid') ? 'bg-green-500/10 text-green-500' : 
                        (order.payment_status === 'failed' || order.status === 'failed') ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {(order.payment_status === 'paid' || order.status === 'completed' || order.status === 'confirmed' || order.status === 'paid') ? <CheckCircle size={12} /> : (order.payment_status === 'failed' || order.status === 'failed') ? <XCircle size={12} /> : <Clock size={12} />}
                        {(order.status === 'completed') ? 'COMPLETED' : (order.payment_status === 'paid' || order.status === 'confirmed' || order.status === 'paid') ? 'PAID' : (order.status || order.payment_status || 'PENDING')}
                      </div>

                      {(order.payment_status === 'paid' || order.status === 'completed' || order.status === 'confirmed' || order.status === 'paid') && (
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          (order.delivery_status === 'delivered' || order.delivery_status === 'sent' || order.delivery_status === 'login_sent' || order.product_name?.toLowerCase().includes('medal')) ? 'bg-brand-accent/10 text-brand-accent' : 'bg-orange-500/10 text-orange-500'
                        }`}>
                          {(order.delivery_status === 'delivered' || order.delivery_status === 'sent' || order.delivery_status === 'login_sent' || order.product_name?.toLowerCase().includes('medal')) ? 'DELIVERED' : 'AWAITING LOGINS'}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
