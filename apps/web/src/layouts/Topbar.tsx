import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { Logo, MenuIcon, UploadIcon } from '@/components/icons';
import { useUIStore } from '@/stores/uiStore';

export function Topbar() {
  const toggleMobileNav = useUIStore((s) => s.toggleMobileNav);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass px-4 sm:px-6">
      <button
        type="button"
        onClick={toggleMobileNav}
        className="-ml-1 rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon />
      </button>

      <Link to="/" title="Back to home" className="flex items-center gap-2 lg:hidden">
        <Logo />
        <span className="font-semibold">Decodr</span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <Link to="/upload">
          <Button size="sm">
            <UploadIcon width={16} height={16} />
            Upload project
          </Button>
        </Link>
      </div>
    </header>
  );
}
