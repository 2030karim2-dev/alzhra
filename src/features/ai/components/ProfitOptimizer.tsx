import React from 'react';
import { Target, ArrowUpRight, PiggyBank } from 'lucide-react';

const ProfitOptimizer: React.FC = () => (
  <div className="p-4 space-y-3">
    <h3 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
      <Target size={14} className="text-amber-500" /> محسن الأرباح
    </h3>
    <div className="bg-[var(--app-surface)] rounded-xl p-3 border border-[var(--app-border)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--app-text-secondary)]">تحسين التسعير</span>
        <ArrowUpRight size={14} className="text-amber-500" />
      </div>
      <div className="bg-amber-500/10 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <PiggyBank size={12} className="text-amber-600" />
          <span className="text-[var(--app-text)]">اقتراحات تحسين الأرباح</span>
        </div>
        <ul className="text-[10px] text-[var(--app-text-secondary)] space-y-1 list-disc list-inside">
          <li>راجع أسعار المنتجات منخفضة الهامش</li>
          <li>قلل المصروفات المتكررة</li>
          <li>حسّن إدارة المخزون لتقليل التالف</li>
        </ul>
      </div>
    </div>
  </div>
);

export default ProfitOptimizer;
export { ProfitOptimizer };
