import React from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = React.memo(({ 
  icon = <PackageOpen size={48} className="text-gray-400" />,
  title = 'لا توجد بيانات',
  description = 'لم يتم العثور على أي عناصر',
  action
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center" role="status">
    <div className="mb-4 text-gray-400">{icon}</div>
    <h3 className="text-base font-semibold text-[var(--app-text)] mb-1">{title}</h3>
    <p className="text-sm text-[var(--app-text-secondary)] max-w-sm mb-4">{description}</p>
    {action}
  </div>
));

export default EmptyState;
export { EmptyState };
