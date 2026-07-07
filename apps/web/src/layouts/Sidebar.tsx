import { useState } from 'react';
import { NavLink, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/utils/cn';
import {
  DashboardIcon,
  GraphIcon,
  Logo,
  SparkIcon,
  TrashIcon,
  UploadIcon,
} from '@/components/icons';
import { Button, ConfirmDialog } from '@/components/ui';
import {
  useConversations,
  useDeleteConversation,
} from '@/features/explain/hooks';
import { relativeTime } from '@/utils/time';
import type { ComponentType, MouseEvent, SVGProps } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
}

const WORKSPACE_NAV: NavItem[] = [
  { to: '/app', label: 'Projects', icon: DashboardIcon, end: true },
  { to: '/upload', label: 'Upload', icon: UploadIcon },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-surface-raised text-foreground'
      : 'text-muted hover:bg-surface-raised/60 hover:text-foreground',
  );

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const repoMatch = useMatch('/repositories/:id/*');
  const repoId = repoMatch?.params.id;

  return (
    <div className="flex h-full flex-col p-4">
      <NavLink to="/app" onClick={onNavigate} className="mb-6 flex items-center gap-2.5 px-2">
        <Logo />
        <span className="text-base font-semibold tracking-tight">Arcloom</span>
      </NavLink>

      <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
        Workspace
      </p>
      {WORKSPACE_NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={navClass}>
          <item.icon width={18} height={18} />
          {item.label}
        </NavLink>
      ))}

      {repoId ? (
        <RepoSection repoId={repoId} onNavigate={onNavigate} />
      ) : (
        <div className="flex-1" />
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface-raised/50 p-3">
        <p className="text-xs font-medium text-foreground">Understand any codebase</p>
        <p className="mt-1 text-[11px] leading-relaxed text-subtle">
          Map architecture, dependencies, and structure in minutes.
        </p>
      </div>
    </div>
  );
}

/** The active project's views + its saved Explain conversations. */
function RepoSection({ repoId, onNavigate }: { repoId: string; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const activeConversation = params.get('c');
  const { data: conversations = [], isLoading } = useConversations(repoId);
  const del = useDeleteConversation(repoId);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const REPO_NAV: NavItem[] = [
    { to: `/repositories/${repoId}`, label: 'Dashboard', icon: DashboardIcon, end: true },
    { to: `/repositories/${repoId}/graph`, label: 'Graph', icon: GraphIcon },
    { to: `/repositories/${repoId}/explain`, label: 'Explain', icon: SparkIcon, end: true },
  ];

  const openExplain = (conversationId?: string) => {
    navigate(`/repositories/${repoId}/explain${conversationId ? `?c=${conversationId}` : ''}`);
    onNavigate?.();
  };

  const requestDelete = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmId(id);
  };

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col">
      <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
        This project
      </p>
      {REPO_NAV.map((item) => (
        <NavLink key={item.label} to={item.to} end={item.end} onClick={onNavigate} className={navClass}>
          <item.icon width={18} height={18} />
          {item.label}
        </NavLink>
      ))}

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <Button size="sm" className="w-full" onClick={() => openExplain()}>
          <SparkIcon width={16} height={16} />
          New chat
        </Button>

        <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto">
          {isLoading && <p className="px-3 py-2 text-xs text-subtle">Loading chats…</p>}
          {!isLoading && conversations.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-subtle">No chats yet.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openExplain(c.id)}
              className={cn(
                'group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors',
                c.id === activeConversation
                  ? 'bg-surface-raised text-foreground'
                  : 'text-muted hover:bg-surface-raised/60 hover:text-foreground',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{c.title}</p>
                <p className="text-[10px] text-subtle">{relativeTime(c.updatedAt)}</p>
              </div>
              <span
                role="button"
                aria-label="Delete chat"
                onClick={(e) => requestDelete(e, c.id)}
                className="shrink-0 rounded p-1 text-subtle opacity-0 transition-all hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
              >
                <TrashIcon width={13} height={13} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete chat?"
        description="This conversation and its messages will be permanently removed."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => {
          if (confirmId) {
            const id = confirmId;
            del.mutate(id, {
              onSuccess: () => {
                if (id === activeConversation) openExplain();
              },
            });
          }
          setConfirmId(null);
        }}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}
