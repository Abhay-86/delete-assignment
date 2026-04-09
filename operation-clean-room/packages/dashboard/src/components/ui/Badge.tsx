import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success:
    'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  warning:
    'bg-amber-400/10 text-amber-400 border-amber-400/20',
  error:
    'bg-red-400/10 text-red-400 border-red-400/20',
  info:
    'bg-blue-400/10 text-blue-400 border-blue-400/20',
  neutral:
    'bg-slate-400/10 text-slate-400 border-slate-400/20',
};

export function Badge({
  variant = 'neutral',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium leading-none',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
