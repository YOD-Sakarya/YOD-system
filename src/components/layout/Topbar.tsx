import type { ReactNode } from 'react';
import { ChevronLeft, Menu } from 'lucide-react';
import type { User } from '../../types';

type Props = {
  title: string;
  user: User;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  /** Extra controls before the search box (cycle switcher, storage bar). */
  actions?: ReactNode;
  /** The workspace search box. */
  search: ReactNode;
};

/** Breadcrumb, header controls (cycle switcher, storage, search) and user avatar. */
export function Topbar({ title, user, sidebarOpen, onOpenSidebar, actions, search }: Props) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button
          className="icon-button mobile-only"
          aria-label="فتح القائمة"
          aria-expanded={sidebarOpen}
          aria-controls="workspace-sidebar"
          onClick={onOpenSidebar}
        >
          <Menu />
        </button>
        <span>مساحة الاتحاد</span>
        <ChevronLeft size={14} />
        <strong>{title}</strong>
      </div>
      <div className="topbar-actions">
        {actions}
        {search}
        <span className="topbar-divider" />
        <span className="avatar">{user.fullName.charAt(0)}</span>
      </div>
    </header>
  );
}
