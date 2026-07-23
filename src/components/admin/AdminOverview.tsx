import React from 'react';
import { 
  Users, DollarSign, ShoppingCart, RefreshCw, 
  TrendingUp, ArrowUpRight, ArrowDownRight,
  Package, Share2, MessageSquare
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';

const sampleRevenueData = [
  { name: 'Jan', value: 4000 },
  { name: 'Feb', value: 3000 },
  { name: 'Mar', value: 5000 },
  { name: 'Apr', value: 4500 },
  { name: 'May', value: 6000 },
  { name: 'Jun', value: 5500 },
  { name: 'Jul', value: 7000 },
];

const sampleOrdersData = [
  { name: 'Mon', orders: 20 },
  { name: 'Tue', orders: 35 },
  { name: 'Wed', orders: 25 },
  { name: 'Thu', orders: 45 },
  { name: 'Fri', orders: 30 },
  { name: 'Sat', orders: 55 },
  { name: 'Sun', orders: 40 },
];

interface StatCardProps {
  label: string;
  value: string | number;
  icon: any;
  trend: number;
  color: string;
}

const StatCard = ({ label, value, icon: Icon, trend, color }: StatCardProps) => (
  <div className="bg-brand-card border border-brand-border p-6 rounded-2xl">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl bg-${color}-500/10 text-${color}-500`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className={`flex items-center gap-1 text-xs font-bold ${trend > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
        {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {Math.abs(trend)}%
      </div>
    </div>
    <div>
      <h3 className="text-brand-text-secondary text-xs font-bold uppercase tracking-widest mb-1">{label}</h3>
      <p className="text-2xl font-bold text-brand-text">{value}</p>
    </div>
  </div>
);

export default function AdminOverview({ stats }: { stats: any }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Primary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Total Users" 
          value={stats.totalUsers || 0} 
          icon={Users} 
          trend={12} 
          color="blue" 
        />
        <StatCard 
          label="Total Revenue" 
          value={`₦${(stats.revenue || 0).toLocaleString()}`} 
          icon={DollarSign} 
          trend={8.2} 
          color="emerald" 
        />
        <StatCard 
          label="Total Orders" 
          value={stats.totalOrders || 0} 
          icon={ShoppingCart} 
          trend={-3} 
          color="amber" 
        />
        <StatCard 
          label="Active Subs" 
          value={stats.activeSubscriptions || 0} 
          icon={RefreshCw} 
          trend={24} 
          color="purple" 
        />
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-brand-card border border-brand-border p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-orange-500/10 text-orange-500">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-brand-text-secondary text-[10px] font-bold uppercase tracking-widest">Rewards Pending</p>
            <p className="text-lg font-bold text-brand-text">₦0</p>
          </div>
        </div>
        <div className="bg-brand-card border border-brand-border p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-500">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-brand-text-secondary text-[10px] font-bold uppercase tracking-widest">Products Count</p>
            <p className="text-lg font-bold text-brand-text">{stats.totalProducts || 0}</p>
          </div>
        </div>
        <div className="bg-brand-card border border-brand-border p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-pink-500/10 text-pink-500">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <p className="text-brand-text-secondary text-[10px] font-bold uppercase tracking-widest">Support Tickets</p>
            <p className="text-lg font-bold text-brand-text">4</p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-brand-card border border-brand-border p-8 rounded-[32px]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-brand-text flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Monthly Revenue
            </h3>
            <div className="text-[10px] uppercase font-bold tracking-widest text-brand-text-secondary flex items-center gap-4">
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /> Subscription</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Sales</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sampleRevenueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0D111A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3B82F6" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#3B82F6', strokeWidth: 2, stroke: '#0D111A' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-brand-card border border-brand-border p-8 rounded-[32px]">
          <h3 className="font-bold text-brand-text mb-8 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-amber-500" />
            Orders Velocity
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sampleOrdersData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }}
                  contentStyle={{ backgroundColor: '#0D111A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Bar 
                  dataKey="orders" 
                  fill="#F59E0B" 
                  radius={8} 
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
