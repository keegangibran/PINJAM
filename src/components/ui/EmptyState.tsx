import React from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
  ...rest
}) => {
  return (
    <div
      className={`p-10 sm:p-12 text-center rounded-card border border-dashed border-slate-200 bg-surface flex flex-col items-center justify-center space-y-3 ${className}`.trim()}
      {...rest}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
        {icon || <Inbox size={24} />}
      </div>

      <div className="space-y-1 max-w-sm">
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        {description && <p className="text-xs text-slate-500 leading-relaxed">{description}</p>}
      </div>

      {action && <div className="pt-2">{action}</div>}
    </div>
  );
};

export default EmptyState;
