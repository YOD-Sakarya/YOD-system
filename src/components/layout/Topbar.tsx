import type { ReactNode } from 'react';
import { ChevronLeft, Menu, Search } from 'lucide-react';
import type { User } from '../../types';

type Props = {
  title: string;
  user: User;
  query: string;
  sidebarOpen: boolean;
  onQueryChange: (query: string) => void;
  onOpenSidebar: () => void;
  /** Extra controls before the search box (cycle switcher, storage bar). */
  actions?: ReactNode;
};

/** Breadcrumb, workspace-wide search box and user avatar. */
export function Topbar({ title, user, query, sidebarOpen, onQueryChange, onOpenSidebar, actions }: Props) {
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
        <label className="global-search">
          <Search size={17} />
          <input
            aria-label="البحث في مساحة العمل"
            placeholder="ابحث في مساحة العمل…"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
          />
          <kbd>بحث</kbd>
        </label>
        <span className="topbar-divider" />
        <span className="avatar">{user.fullName.charAt(0)}</span>
      </div>
    </header>
  );
}
