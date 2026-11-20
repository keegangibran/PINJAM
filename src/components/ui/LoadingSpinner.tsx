import React from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerVariant = 'primary' | 'navy' | 'white' | 'neutral';

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-3',
};

const variantClasses: Record<SpinnerVariant, string> = {
  primary: 'border-brand-primary/20 border-t-brand-primary text-brand-primary',
  navy: 'border-navy-800/20 border-t-navy-800 text-navy-800',
  white: 'border-white/30 border-t-white text-white',
  neutral: 'border-slate-300 border-t-slate-700 text-slate-700',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  label = 'Memuat...',
  className = '',
  ...rest
}) => {
  return (
    <div
      role="status"
      aria-label={label}
      className={`inline-flex items-center justify-center ${className}`.trim()}
      {...rest}
    >
      <span
        className={`inline-block animate-spin rounded-full ${sizeClasses[size]} ${variantClasses[variant]}`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
};

export default LoadingSpinner;
