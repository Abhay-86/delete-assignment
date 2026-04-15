import { RefreshCw } from 'lucide-react';

// Reporting period is fixed: full year 2024 (Q1–Q4).
const WINDOW_START = 'Q1 2024';
const WINDOW_END   = 'Q4 2024';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-6 py-4 backdrop-blur-sm">
      {/* Title block */}
      <div>
        <h1 className="text-base font-semibold text-white">
          Operation Clean Room
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Emergency Board Readiness Dashboard
        </p>
      </div>

      {/* Right side: filter placeholders + refresh */}
      <div className="flex items-center gap-4">
        {/* Date range — fixed 2024 Q1–Q4 reporting window */}
        <div className="hidden items-center gap-2 rounded-md border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 font-mono text-xs text-slate-400 sm:flex">
          <span>{WINDOW_START}</span>
          <span className="text-slate-600">&mdash;</span>
          <span>{WINDOW_END}</span>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/50 bg-slate-800/50 text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-700/50 hover:text-slate-200"
          title="Refresh data"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  );
}
