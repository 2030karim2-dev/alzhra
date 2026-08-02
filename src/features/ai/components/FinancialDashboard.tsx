import React from 'react';
import { useDashboardMetrics } from '../../dashboard/hooks/useDashboardMetrics';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';

const FinancialDashboard: React.FC = () => {
  const { stats, revenueExpensesData, growthRate, salesValue } = useDashboardMetrics();

  const parseNumeric = (v?: string) => parseFloat((v || '0').replace(/[^0-9.-]/g, '')) || 0;

  const kpis = [
    { label: 'المبيعات', value: stats?.sales || '0', icon: DollarSign, trend: growthRate > 0 ? 'up' : 'down' },
    { label: 'المصروفات', value: stats?.expenses || '0', icon: TrendingDown, trend: 'down' },
    { label: 'صافي الربح', value: stats?.profit || '0', icon: Activity, trend: parseNumeric(stats?.profit) > 0 ? 'up' : 'down' },
  ];

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-[var(--app-text)]">لوحة المؤشرات المالية الذكية</h3>
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-[var(--app-surface)] rounded-xl p-3 border border-[var(--app-border)]">
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon size={14} className={kpi.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'} />
              <span className="text-[10px] text-[var(--app-text-secondary)]">{kpi.label}</span>
            </div>
            <div className="text-lg font-bold text-[var(--app-text)]">{kpi.value}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--app-text-secondary)]">
        {growthRate > 0 ? '📈 نمو إيجابي' : '📉 انخفاض'} بنسبة {Math.abs(growthRate).toFixed(1)}% مقارنة بالمتوسط
      </p>
    </div>
  );
};

export default FinancialDashboard;
export { FinancialDashboard };
