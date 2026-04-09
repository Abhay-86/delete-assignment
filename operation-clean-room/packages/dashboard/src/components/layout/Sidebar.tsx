import { NavLink } from 'react-router-dom';
import {
  DollarSign,
  AlertTriangle,
  Users,
  Activity,
  GitBranch,
  Sliders,
  FileSearch,
  Terminal,
} from 'lucide-react';
import { clsx } from 'clsx';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const navigation: NavItem[] = [
  { to: '/revenue', label: 'Revenue', icon: <DollarSign size={18} /> },
  { to: '/discrepancies', label: 'Discrepancies', icon: <AlertTriangle size={18} /> },
  { to: '/cohorts', label: 'Cohorts', icon: <Users size={18} /> },
  { to: '/health', label: 'Customer Health', icon: <Activity size={18} /> },
  { to: '/pipeline', label: 'Pipeline', icon: <GitBranch size={18} /> },
  { to: '/scenarios', label: 'Scenarios', icon: <Sliders size={18} /> },
  { to: '/audit', label: 'Audit Trail', icon: <FileSearch size={18} /> },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 flex-col border-r border-slate-800/80 bg-slate-900/50 backdrop-blur-sm">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-slate-800/80 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-electric/10">
          <Terminal size={16} className="text-electric" />
        </div>
        <div>
          <h1 className="font-mono text-sm font-bold tracking-widest text-slate-100">
            CLEAN ROOM
          </h1>
          <p className="font-mono text-[10px] tracking-wider text-slate-500">
            v0.1.0
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-3 px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-600">
          Analytics
        </p>
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'nav-link group',
                isActive && 'active',
              )
            }
          >
            <span
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                'text-slate-400 group-hover:text-slate-200',
                'group-[.active]:bg-electric/10 group-[.active]:text-electric',
              )}
            >
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="status-dot status-dot--ok" />
          <span className="font-mono text-xs text-slate-500">
            Engine connected
          </span>
        </div>
      </div>
    </aside>
  );
}
