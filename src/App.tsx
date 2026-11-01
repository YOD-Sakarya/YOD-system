import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DocumentDialog } from './components/dialogs/DocumentDialog';
import { DocumentForm } from './components/dialogs/DocumentForm';
import { SessionForm } from './components/dialogs/SessionForm';
import { VoteDialog } from './components/dialogs/VoteDialog';
import { BootScreen } from './components/layout/BootScreen';
import { PreviewBanner } from './components/layout/PreviewBanner';
import { Sidebar } from './components/layout/Sidebar';
import { Toast } from './components/layout/Toast';
import { Topbar } from './components/layout/Topbar';
import { demoData, demoUser } from './data/demo';
import { navigation } from './data/navigation';
import AuthEntry from './features/auth/AuthEntry';
import { LegacyLoginScreen } from './features/auth/LegacyLoginScreen';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useDialogs } from './hooks/useDialogs';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useToast } from './hooks/useToast';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import { api } from './lib/api';
import { signOutNeon } from './lib/auth';
import type { User } from './types';
import { WorkspaceRoutes } from './WorkspaceRoutes';

const PENDING_STATUS = 'قيد المراجعة';

/**
 * Application shell. Owns the session (real or demo preview), loads workspace data
 * and wires the global dialogs; page content lives in WorkspaceRoutes.
 */
export default function App() {
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mobile = useMediaQuery('(max-width: 850px)');
  const { user, setUser, checking } = useCurrentUser(setError);
  const workspace = useWorkspaceData({ user, preview, setUser, setError });
  const dialogs = useDialogs();
  const { toast, showToast, clearToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // api() raises this event on any 401 outside the login endpoints: drop all session-bound state.
  useEffect(() => {
    const onExpired = () => {
      workspace.reset();
      setUser(null);
      dialogs.closeAll();
      setError('انتهت الجلسة. سجّل الدخول مجددًا للمتابعة.');
    };
    window.addEventListener('yod-session-expired', onExpired);
    return () => window.removeEventListener('yod-session-expired', onExpired);
  }, [workspace.reset, setUser, dialogs.closeAll]);

  // Navigating clears the mobile menu and the workspace search.
  useEffect(() => {
    setSidebarOpen(false);
    setQuery('');
  }, [location.pathname, location.search]);

  /** Shared "saved" handler for every dialog: close them all, confirm, and refresh the data. */
  const handleSaved = async (message: string) => {
    dialogs.closeAll();
    showToast(message);
    await workspace.reload();
  };

  async function logout() {
    if (!preview) {
      try {
        await signOutNeon();
        await api('/auth/logout', { method: 'POST' });
      } catch {
        showToast('تعذر تسجيل الخروج. حاول مرة أخرى.');
        return;
      }
    }
    workspace.reset();
    setPreview(false);
    setUser(null);
    setError('');
    navigate('/');
  }

  if (checking) return <BootScreen message="جارٍ تجهيز مساحة العمل…" />;

  if (!user || location.pathname.startsWith('/auth/')) {
    const onLogin = (signedIn: User) => {
      setPreview(false);
      setUser(signedIn);
      navigate('/');
    };
    // Preview mode swaps in sample data and never calls the API.
    const onPreview = () => {
      setPreview(true);
      setUser(demoUser);
      workspace.setData(demoData);
      setError('');
      navigate('/');
    };
    return (
      <AuthEntry
        initialError={error}
        legacy={<LegacyLoginScreen error={error} onLogin={onLogin} onPreview={onPreview} />}
        onLogin={onLogin}
        onPreview={onPreview}
      />
    );
  }

  const { data, loading } = workspace;
  const pendingReviews = data.documents.filter(doc => doc.status === PENDING_STATUS).length;
  const title = navigation.find(item => item.to === location.pathname)?.label || 'مساحة العمل';

  return (
    <div className="workspace" dir="rtl">
      {sidebarOpen && <button className="sidebar-scrim" aria-label="إغلاق القائمة" onClick={closeSidebar} />}
      <Sidebar
        user={user}
        roles={data.catalog.roles}
        pendingReviews={pendingReviews}
        open={sidebarOpen}
        mobile={mobile}
        onClose={closeSidebar}
        onLogout={logout}
      />
      {/* While the mobile menu is open the page behind it is inert. */}
      <div className="main-shell" inert={mobile && sidebarOpen}>
        <Topbar
          title={title}
          user={user}
          query={query}
          sidebarOpen={sidebarOpen}
          onQueryChange={setQuery}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        {preview && <PreviewBanner onLogin={logout} />}
        <main className="main-content" id="main-content" aria-busy={loading}>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={workspace.reload}>
                <RefreshCw size={15} />
                إعادة المحاولة
              </button>
            </div>
          )}
          <WorkspaceRoutes
            data={data}
            user={user}
            query={query}
            loading={loading}
            onUpload={dialogs.openUpload}
            onCreateSession={dialogs.openSession}
            onDocument={dialogs.viewDocument}
            onVote={dialogs.viewVote}
          />
          <footer className="page-footer">
            <span>اتحاد الطلاب اليمنيين في سكاريا</span>
            <span>نعمل معًا، ونترك أثرًا.</span>
          </footer>
        </main>
      </div>
      {toast && <Toast message={toast} onClose={clearToast} />}
      {dialogs.viewedDocument && (
        <DocumentDialog
          document={dialogs.viewedDocument}
          user={user}
          preview={preview}
          onClose={dialogs.closeDocument}
          onSaved={handleSaved}
          onEdit={dialogs.editDocument}
        />
      )}
      {dialogs.showUpload && (
        <DocumentForm
          document={dialogs.editedDocument}
          user={user}
          catalog={data.catalog}
          preview={preview}
          onClose={dialogs.closeUpload}
          onSaved={handleSaved}
        />
      )}
      {dialogs.showSession && <SessionForm preview={preview} onClose={dialogs.closeSession} onSaved={handleSaved} />}
      {dialogs.voteSession && (
        <VoteDialog
          session={dialogs.voteSession}
          user={user}
          preview={preview}
          onClose={dialogs.closeVote}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
