import React from 'react';

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
export type BadgeSize = 'sm' | 'md';

export type DomainStatus =
  | 'AVAILABLE'
  | 'BORROWED'
  | 'MAINTENANCE'
  | 'INACTIVE'
  | 'ACTIVE'
  | 'OVERDUE'
  | 'COMPLETED'
  | 'NORMAL'
  | 'REPORTED_ISSUE'
  | 'PENDING_REVIEW'
  | 'REJECTED';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  status?: DomainStatus;
  dot?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-200/80',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200/80',
  primary: 'bg-navy-50 text-navy-800 border-navy-100',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
};

const dotClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-500',
  neutral: 'bg-slate-500',
  primary: 'bg-navy-800',
  success: 'bg-emerald-600',
  warning: 'bg-amber-600',
  danger: 'bg-rose-600',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

interface StatusConfig {
  variant: BadgeVariant;
  label: string;
}

const domainStatusMap: Record<DomainStatus, StatusConfig> = {
  AVAILABLE: { variant: 'success', label: 'Tersedia' },
  BORROWED: { variant: 'primary', label: 'Dipinjam' },
  MAINTENANCE: { variant: 'warning', label: 'Perawatan' },
  INACTIVE: { variant: 'neutral', label: 'Non-Aktif' },
  ACTIVE: { variant: 'primary', label: 'Sedang Berjalan' },
  OVERDUE: { variant: 'danger', label: 'Terlambat' },
  COMPLETED: { variant: 'success', label: 'Selesai' },
  NORMAL: { variant: 'success', label: 'Normal' },
  REPORTED_ISSUE: { variant: 'warning', label: 'Ada Kendala' },
  PENDING_REVIEW: { variant: 'warning', label: 'Menunggu Verifikasi' },
  REJECTED: { variant: 'danger', label: 'Ditolak' },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'sm',
  status,
  dot = false,
  icon,
  className = '',
  children,
  ...rest
}) => {
  const resolvedVariant = status ? domainStatusMap[status]?.variant || variant : variant;
  const resolvedLabel = status ? domainStatusMap[status]?.label : children;

  return (
    <span
      className={`inline-flex items-center justify-center font-semibold rounded-full border ${variantClasses[resolvedVariant]} ${sizeClasses[size]} ${className}`.trim()}
      {...rest}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClasses[resolvedVariant]}`}
          aria-hidden="true"
        />
      )}
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{resolvedLabel}</span>
    </span>
  );
};

export default Badge;
