import React from 'react';
import { Lightbulb, TrendingUp, Shield, AlertTriangle } from 'lucide-react';

const StrategicAdvisor: React.FC = () => {
  const tips = [
    { icon: TrendingUp, text: 'ركز على المنتجات الأعلى هامش ربح', color: 'text-emerald-500' },
    { icon: Shield, text: 'حافظ على نسبة سيولة آمنة للطوارئ', color: 'text-blue-500' },
    { icon: AlertTriangle, text: 'تابع الديون المستحقة أسبوعياً', color: 'text-amber-500' },
    { icon: Lightbulb, text: 'استخدم تحليلات الذكاء الاصطناعي للتنبؤ بالطلب', color: 'text-purple-500' },
  ];

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
        <Lightbulb size={14} className="text-yellow-500" /> المستشار الاستراتيجي
      </h3>
      <div className="bg-[var(--app-surface)] rounded-xl p-3 border border-[var(--app-border)] space-y-2">
        {tips.map((tip, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <tip.icon size={14} className={`${tip.color} flex-shrink-0 mt-0.5`} />
            <span className="text-[var(--app-text)]">{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StrategicAdvisor;
export { StrategicAdvisor };
