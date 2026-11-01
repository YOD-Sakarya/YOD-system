import { useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, LogOut, ShieldCheck, Users, X } from 'lucide-react';
import { adminNavigation, navigation } from '../../data/navigation';
import { useSidebarPanel } from '../../hooks/useSidebarPanel';
import { number } from '../../lib/format';
import { isCommitteeRole, isDeveloper } from '../../lib/roles';
import type { Catalog, User } from '../../types';
import { Brand } from '../ui/Brand';

type Props = {
  user: User;
  roles: Catalog['roles'];
  pendingReviews: number;
  open: boolean;
  mobile: boolean;
  onClose: () => void;
  onLogout: () => void;
};

/** Main navigation, per-committee shortcuts and the signed-in user card. Becomes an off-canvas panel on mobile. */
export function Sidebar({ user, roles, pendingReviews, open, mobile, onClose, onLogout }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const selectedRole = new URLSearchParams(location.search).get('role');
  const committees = roles.filter(isCommitteeRole);
  const items = isDeveloper(user) ? [...navigation, adminNavigation] : navigation;
  // Focus trap and scroll lock only apply while the mobile panel is open.
  useSidebarPanel(panelRef, open && mobile, onClose);

  return (
    <aside
      ref={panelRef}
      id="workspace-sidebar"
      className={`sidebar ${open ? 'open' : ''}`}
      // Hidden mobile panel must not be reachable by keyboard or screen readers.
      inert={mobile && !open}
      aria-label="قائمة مساحة العمل"
    >
      <div className="sidebar-brand">
        <Brand compact />
        <button className="icon-button mobile-only" aria-label="إغلاق القائمة" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="workspace-label">
        <span className="workspace-icon">
          <Users size={18} />
        </span>
        <div>
          <strong>الهيئة التنفيذية</strong>
          <small>مساحة عمل الاتحاد</small>
        </div>
        <ShieldCheck size={17} />
      </div>
      {/* One scroll area for all navigation; the brand stays on top and the user card at the bottom. */}
      <div className="sidebar-scroll">
        <nav aria-label="التنقل الرئيسي">
          {items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <item.icon size={19} />
              <span>{item.label}</span>
              {/* Badge shows how many proposals still await review. */}
              {item.to === '/reviews' && pendingReviews > 0 && <b>{number(pendingReviews)}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="committee-heading">
          مساحات اللجان <span>{number(committees.length)}</span>
        </div>
        <nav className="committee-nav" aria-label="اللجان">
          {committees.map(role => {
            const active = location.pathname === '/documents' && selectedRole === String(role.roleId);
            return (
              <Link
                key={role.roleId}
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
                to={`/documents?role=${role.roleId}`}
              >
                <span className={`committee-dot dot-${role.roleId % 4}`} />
                <span>{role.roleName}</span>
                <ChevronLeft size={14} />
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="sidebar-bottom">
        <Link className="user-link" to="/account" title="حسابي" aria-label={`حسابي: ${user.fullName}`}>
          <div className="avatar small">{user.fullName.charAt(0)}</div>
          <div>
            <strong>{user.fullName}</strong>
            <small>{user.roleName}</small>
          </div>
        </Link>
        <button className="icon-button" onClick={onLogout} aria-label="تسجيل الخروج" title="تسجيل الخروج">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
