import React, { useEffect, useState } from 'react';
import { VPPortfolio, VPPortfolioItem } from '../../../types/verification';
import { supabase } from '../../../lib/supabase';
import { CATEGORY_REACTIONS, getReactionCount } from '../../../utils/verification';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

export function TabAnalytics({ portfolio }: { portfolio: VPPortfolio }) {
  const [items, setItems] = useState<VPPortfolioItem[]>([]);
  
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!portfolio.id) return;
      
      console.log("[analytics] fetching for portfolio:", portfolio.id);
      
      const { data: fetchItems, error } = await supabase
        .from("vp_portfolio_items")
        .select("id, title, reaction_count, fire_count, mind_blown_count, hire_count, love_this_count, clean_work_count, stunning_count, clean_code_count, impressive_count, slick_design_count, great_writing_count, spot_on_count, results_count, smart_build_count, solid_work_count")
        .eq("portfolio_id", portfolio.id)
        .order("reaction_count", { ascending: false });
      
      console.log("[analytics] items:", fetchItems, error);
      setItems(fetchItems || []);
    };

    fetchAnalytics();

    const uniqueSuffix = Math.random().toString(36).slice(2, 9);
    const channel = supabase
      .channel("analytics-" + portfolio.id + "-" + uniqueSuffix)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "vp_portfolio_items",
        filter: "portfolio_id=eq." + portfolio.id
      }, (payload) => {
        console.log("[analytics] realtime update:", payload.new);
        setItems(prev => 
          prev.map(item => 
            item.id === payload.new.id ? payload.new as any : item
          )
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [portfolio.id]);

  const totalViews = portfolio.view_count || 0;
  
  const totalReactions = items.reduce(
    (sum, item) => sum + (item.reaction_count || 0), 0
  );
  
  const totalHireMe = items.reduce(
    (sum, item) => sum + (item.hire_count || 0), 0
  );

  const chartData = items.map(item => {
    let reactions = 0;
    const catReactions = CATEGORY_REACTIONS[portfolio.category] || [];
    catReactions.forEach(r => {
      reactions += getReactionCount(item, r.type as string);
    });

    const hires = item.hire_count || 0;
    const fires = (item.fire_count || 0) + (item.mind_blown_count || 0);

    return {
      title: item.title.length > 12 ? item.title.substring(0, 12) + '...' : item.title,
      reactions,
      hires,
      fires
    };
  });

  const hireItems = [...items].filter(i => (i.hire_count || 0) > 0).sort((a, b) => (b.hire_count || 0) - (a.hire_count || 0));

  return (
    <div className="space-y-8 fade-in pb-12">
      {/* SUMMARY CARDS ROW */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 dark:bg-[#111] border border-brand-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-brand-text tracking-widest">{totalViews}</div>
          <div className="text-[10px] text-brand-text-secondary uppercase tracking-wider font-bold mt-1">Total Views</div>
        </div>
        <div className="bg-gray-50 dark:bg-[#111] border border-brand-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-brand-text tracking-widest">{totalReactions}</div>
          <div className="text-[10px] text-brand-text-secondary uppercase tracking-wider font-bold mt-1">Total Reactions</div>
        </div>
        <div className="bg-gray-50 dark:bg-[#111] border border-brand-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-brand-text tracking-widest">{totalHireMe}</div>
          <div className="text-[10px] text-brand-text-secondary uppercase tracking-wider font-bold mt-1">Hire Me Signals</div>
        </div>
      </div>

      {/* HIRE ME SIGNALS */}
      <div>
        <h3 className="text-brand-text text-sm font-semibold mb-1 border-b border-brand-border pb-2">💼 HIRE ME SIGNALS</h3>
        <p className="text-gray-400 dark:text-[#555] text-xs mb-4">These pieces are making clients want to hire you</p>
        
        {hireItems.length === 0 ? (
          <div className="bg-brand-surface border border-brand-border rounded-lg p-6 text-center text-brand-text-secondary font-medium text-sm">
            No hire signals yet. Share your portfolio to get reactions.
          </div>
        ) : (
          <div className="space-y-2">
            {hireItems.map(item => (
              <div key={item.id} className="bg-gray-50 dark:bg-[#111] border border-brand-border rounded-lg p-3 flex items-center justify-between">
                <span className="text-brand-text font-medium text-sm truncate pr-4">{item.title}</span>
                <span className="bg-[#052e16] text-[#22c55e] px-2 py-1 rounded text-xs font-bold whitespace-nowrap">💼 x{item.hire_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CHART */}
      {items.length > 0 && (
        <div className="pt-4">
          <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">REACTIONS OVERVIEW</h3>
          <div className="bg-gray-50 dark:bg-[#111] border border-brand-border rounded-xl p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="title" stroke="#555" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#555" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip cursor={{fill: '#1a1a1a'}} contentStyle={{backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#fff'}} />
                <Bar dataKey="reactions" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.hires > 0 ? '#22c55e' : entry.fires > 0 ? '#EF4444' : '#2563eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* REACTIONS TABLE */}
      {items.length > 0 && (
        <div className="pt-4">
          <h3 className="text-brand-text text-sm font-semibold mb-4 border-b border-brand-border pb-2">ALL WORK REACTIONS</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-[#111] text-brand-text-secondary text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-3 rounded-tl-lg">Item</th>
                  {(CATEGORY_REACTIONS[portfolio.category] || []).map(r => (
                    <th key={r.type} className="p-3 text-center">{r.emoji}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-brand-text divide-y divide-[#222]">
                {items.map(item => (
                  <tr key={item.id} className={`bg-brand-surface ${((item.hire_count || 0) > 0) ? 'border-l-[3px] border-[#22c55e]' : ''}`}>
                    <td className="p-3 truncate max-w-[150px] font-medium">{item.title}</td>
                    {(CATEGORY_REACTIONS[portfolio.category] || []).map(r => (
                      <td key={r.type} className="p-3 text-center text-brand-text-secondary">
                        {getReactionCount(item, r.type as string) > 0 ? (
                          <span className="text-brand-text font-bold">{getReactionCount(item, r.type as string)}</span>
                        ) : '0'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
