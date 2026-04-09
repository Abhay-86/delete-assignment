import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  value?: string | number;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Card({
  title,
  value,
  change,
  changeLabel,
  icon,
  className,
  children,
}: CardProps) {
  const changeDirection =
    change === undefined ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return (
    <div
      className={clsx(
        'card rounded-lg border border-slate-700/50 bg-slate-800/80 p-5 backdrop-blur-sm',
        className,
      )}
    >
      {/* Header with title and icon */}
      {(title || icon) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <span className="metric-label text-xs font-medium uppercase tracking-wider text-slate-400">
              {title}
            </span>
          )}
          {icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-700/50 text-slate-400">
              {icon}
            </span>
          )}
        </div>
      )}

      {/* Value */}
      {value !== undefined && (
        <div className="metric-value font-mono text-2xl font-semibold tracking-tight text-slate-100">
          {value}
        </div>
      )}

      {/* Change indicator */}
      {change !== undefined && (
        <div className="mt-2 flex items-center gap-1.5">
          {changeDirection === 'up' && (
            <TrendingUp size={14} className="text-emerald-400" />
          )}
          {changeDirection === 'down' && (
            <TrendingDown size={14} className="text-red-400" />
          )}
          {changeDirection === 'flat' && (
            <Minus size={14} className="text-slate-500" />
          )}
          <span
            className={clsx(
              'font-mono text-xs font-medium',
              changeDirection === 'up' && 'text-emerald-400',
              changeDirection === 'down' && 'text-red-400',
              changeDirection === 'flat' && 'text-slate-500',
            )}
          >
            {change > 0 ? '+' : ''}
            {typeof change === 'number' ? change.toFixed(1) : change}%
          </span>
          {changeLabel && (
            <span className="text-xs text-slate-500">{changeLabel}</span>
          )}
        </div>
      )}

      {/* Slot for arbitrary content */}
      {children}
    </div>
  );
}
