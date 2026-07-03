import { NavLink } from 'react-router-dom';
import { cn } from '@/utils/cn';
import {
  DashboardIcon,
  GraphIcon,
  Logo,
  SparkIcon,
  UploadIcon,
} from '@/components/icons';
import type { ComponentType, SVGProps } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Repositories', icon: DashboardIcon, end: true },
  { to: '/upload', label: 'Upload', icon: UploadIcon },
];

const FEATURE_HINTS: NavItem[] = [
  { to: '#', label: 'Graph', icon: GraphIcon },
  { to: '#', label: 'Explain', icon: SparkIcon },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-1 p-4">
      <NavLink to="/" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 px-2">
        <Logo />
        <span className="text-base font-semibold tracking-tight">Arcloom</span>
      </NavLink>

      <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
        Workspace
      </p>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-surface-raised text-foreground'
                : 'text-muted hover:bg-surface-raised/60 hover:text-foreground',
            )
          }
        >
          <item.icon width={18} height={18} />
          {item.label}
        </NavLink>
      ))}

      <p className="mt-6 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
        Per repository
      </p>
      {FEATURE_HINTS.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-subtle/70"
          title="Open a repository to access this view"
        >
          <item.icon width={18} height={18} />
          {item.label}
        </div>
      ))}

      <div className="mt-auto rounded-xl border border-border bg-surface-raised/50 p-3">
        <p className="text-xs font-medium text-foreground">Understand any React codebase</p>
        <p className="mt-1 text-[11px] leading-relaxed text-subtle">
          Upload a ZIP to map its architecture in minutes.
        </p>
      </div>
    </div>
  );
}
