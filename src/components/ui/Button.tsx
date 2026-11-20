'use client';

import React, { forwardRef } from 'react';
import LoadingSpinner from './LoadingSpinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-navy-800 hover:bg-navy-900 text-white shadow-sm border border-transparent focus:ring-navy-800/25 active:bg-navy-900',
  secondary:
    'bg-brand-soft hover:bg-blue-100 text-brand-primary border border-blue-200/70 shadow-sm focus:ring-brand-primary/20 active:bg-blue-200/80',
  outline:
    'bg-surface hover:bg-canvas text-main border border-borderline shadow-sm focus:ring-navy-800/15 active:bg-slate-100',
  ghost:
    'bg-transparent hover:bg-slate-100/80 text-main border border-transparent focus:ring-navy-800/15 active:bg-slate-200/70',
  danger:
    'bg-rose-600 hover:bg-rose-700 text-white shadow-sm border border-transparent focus:ring-rose-500/25 active:bg-rose-800',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-button min-h-[36px] gap-1.5 font-medium',
  md: 'px-4 py-2.5 text-sm rounded-element min-h-[44px] gap-2 font-semibold',
  lg: 'px-5 py-3 text-base rounded-card min-h-[48px] gap-2.5 font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      disabled = false,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;
    const spinnerVariant = variant === 'primary' || variant === 'danger' ? 'white' : 'navy';

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading}
        className={`inline-flex items-center justify-center transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus:outline-none focus:ring-2 active:scale-[0.99] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
        {...rest}
      >
        {isLoading ? (
          <>
            <LoadingSpinner size={size === 'lg' ? 'md' : 'sm'} variant={spinnerVariant} />
            {loadingText ? <span>{loadingText}</span> : children ? <span>{children}</span> : null}
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
            {children && <span>{children}</span>}
            {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
