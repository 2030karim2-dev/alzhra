import React from 'react';
import { BookOpen, ArrowDownUp, CheckCircle } from 'lucide-react';

const SmartLedger: React.FC = () => (
  <div className="p-4 space-y-3">
    <h3 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
      <BookOpen size={14} className="text-purple-500" /> دفتر الأستاذ الذكي
    </h3>
    <div className="bg-[var(--app-surface)] rounded-xl p-3 border border-[var(--app-border)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--app-text-secondary)]">آخر القيود المحاسبية</span>
        <ArrowDownUp size={14} className="text-purple-500" />
      </div>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        <div className="flex items-center gap-2 text-xs bg-[var(--app-bg)] rounded-lg p-2">
          <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
          <span className="text-[var(--app-text)]">القيد المحاسبي للفواتير يتم إنشاؤه تلقائياً عند تسجيل المبيعات والمشتريات والمصروفات والسندات</span>
        </div>
      </div>
      <p className="text-[9px] text-[var(--app-text-secondary)] text-center">
        راجع قسم التقارير المالية للاطلاع على ميزان المراجعة وقائمة الدخل
      </p>
    </div>
  </div>
);

export default SmartLedger;
export { SmartLedger };
