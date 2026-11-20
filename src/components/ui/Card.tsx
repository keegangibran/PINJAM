import React, { forwardRef } from 'react';

export type CardVariant = 'default' | 'elevated' | 'interactive' | 'accent';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-surface border border-borderline shadow-sm',
  elevated: 'bg-surface border border-borderline shadow-md',
  interactive:
    'bg-surface border border-borderline shadow-sm hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-150 cursor-pointer',
  accent: 'bg-gradient-to-br from-surface to-brand-soft/40 border border-blue-200/80 shadow-sm',
};

const paddingClasses: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3.5 sm:p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className = '', children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-card text-main ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`.trim()}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  action,
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      className={`flex flex-col space-y-1.5 pb-4 border-b border-slate-100 last:border-b-0 ${className}`.trim()}
      {...rest}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...rest
}) => {
  return (
    <h3 className={`text-lg font-bold text-slate-900 tracking-tight ${className}`.trim()} {...rest}>
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...rest
}) => {
  return (
    <p className={`text-xs text-slate-500 leading-relaxed ${className}`.trim()} {...rest}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...rest
}) => {
  return (
    <div className={`pt-4 space-y-3 ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      className={`pt-4 mt-4 border-t border-slate-100 flex items-center justify-end gap-2 text-xs ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
};

export default Card;
