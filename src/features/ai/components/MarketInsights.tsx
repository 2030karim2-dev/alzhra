import React from 'react';
import { TrendingUp, BarChart3, Globe } from 'lucide-react';

const MarketInsights: React.FC = () => (
  <div className="p-4 space-y-3">
    <h3 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
      <Globe size={14} className="text-blue-500" /> تحليلات السوق
    </h3>
    <div className="bg-[var(--app-surface)] rounded-xl p-3 border border-[var(--app-border)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--app-text-secondary)]">أفضل المنتجات مبيعاً</span>
        <TrendingUp size={14} className="text-emerald-500" />
      </div>
      <div className="bg-emerald-500/10 rounded-lg p-2 text-xs text-emerald-600">
        يتم تحليل بيانات السوق تلقائياً من فواتير المبيعات
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[var(--app-bg)] rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-[var(--app-text)]">--</div>
          <div className="text-[9px] text-[var(--app-text-secondary)]">المنتج الأعلى</div>
        </div>
        <div className="bg-[var(--app-bg)] rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-[var(--app-text)]">--</div>
          <div className="text-[9px] text-[var(--app-text-secondary)]">الفئة الأكثر طلباً</div>
        </div>
      </div>
    </div>
  </div>
);

export default MarketInsights;
export { MarketInsights };
