import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DocumentDialog } from './components/dialogs/DocumentDialog';
import { DocumentForm } from './components/dialogs/DocumentForm';
import { SessionForm } from './components/dialogs/SessionForm';
import { VoteDialog } from './components/dialogs/VoteDialog';
import { BootScreen } from './components/layout/BootScreen';
import { ArchiveBanner } from './components/layout/ArchiveBanner';
import { CycleSwitcher } from './components/layout/CycleSwitcher';
import { PreviewBanner } from './components/layout/PreviewBanner';
import { SearchBox } from './components/search/SearchBox';
import { Sidebar } from './components/layout/Sidebar';
import { StorageAlert } from './components/layout/StorageAlert';
import { Toast } from './components/layout/Toast';
import { Topbar } from './components/layout/Topbar';
import { demoData, demoUser } from './data/demo';
import { adminNavigation, navigation } from './data/navigation';
import AuthEntry from './features/auth/AuthEntry';
import { LegacyLoginScreen } from './features/auth/LegacyLoginScreen';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useDialogs } from './hooks/useDialogs';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useToast } from './hooks/useToast';
import { useManagedUsers } from './hooks/useManagedUsers';
import { useStorageUsage } from './hooks/useStorageUsage';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import { api } from './lib/api';
import { signOutNeon } from './lib/auth';
import { isCommitteeRole, isDeveloper } from './lib/roles';
import { buildSearchIndex, type SearchAction } from './lib/search';
import type { Data, User } from './types';
import { WorkspaceRoutes } from './WorkspaceRoutes';

const PENDING_STATUS = 'قيد المراجعة';

/**
 * Application shell. Owns the session (real or demo preview), loads workspace data
 * and wires the global dialogs; page content lives in WorkspaceRoutes.
 */
export default function App() {
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mobile = useMediaQuery('(max-width: 850px)');
  const { user, setUser, checking } = useCurrentUser(setError);
  const workspace = useWorkspaceData({ user, preview, setUser, setError });
  const dialogs = useDialogs();
  const { toast, showToast, clearToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Everyone browses one cycle at a time: the current one by default, or an archived year chosen in the top bar.
  const [chosenCycleId, setChosenCycleId] = useState<number | null>(null);
  const { cycles } = workspace.data;
  const currentCycle = cycles.find(cycle => cycle.isCurrent);
  const activeCycle = cycles.find(cycle => cycle.cycleId === chosenCycleId) ?? currentCycle;
  const archived = !!activeCycle && !activeCycle.isCurrent;
  const scopedData = useMemo<Data>(() => {
    const all = workspace.data;
    if (!activeCycle) return all;
    return {
      ...all,
      documents: all.documents.filter(doc => doc.cycleId === activeCycle.cycleId),
      votes: all.votes.filter(vote => vote.cycleId === activeCycle.cycleId),
    };
  }, [workspace.data, activeCycle]);
  const developer = !!user && isDeveloper(user) && !preview;
  const storage = useStorageUsage(developer);

  // The search covers every year (not just the one being browsed); the developer can also find people.
  const managedUsers = useManagedUsers(developer);
  const searchIndex = useMemo(
    () =>
      buildSearchIndex({
        documents: workspace.data.documents,
        votes: workspace.data.votes,
        cycles,
        roles: workspace.data.catalog.roles,
        pages: (developer ? [...navigation, adminNavigation] : navigation).map(({ to, label }) => ({ to, label })),
        users: developer ? managedUsers : undefined,
        isCommittee: isCommitteeRole,
      }),
    [workspace.data, cycles, developer, managedUsers],
  );
  /** Opening a result from another year switches the page to that year so its read-only rules apply. */
  const openSearchResult = (action: SearchAction) => {
    if (action.type === 'path') navigate(action.to);
    else if (action.type === 'document') {
      setChosenCycleId(action.document.cycleId);
      dialogs.viewDocument(action.document);
    } else {
      setChosenCycleId(action.session.cycleId);
      dialogs.viewVote(action.session);
    }
  };

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

  const { loading } = workspace;
  const data = scopedData;
  const pendingReviews = data.documents.filter(doc => doc.status === PENDING_STATUS).length;
  const title = [...navigation, adminNavigation].find(item => item.to === location.pathname)?.label || 'مساحة العمل';

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
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          search={
            <SearchBox
              index={searchIndex}
              onSelect={openSearchResult}
              onSeeAll={text => navigate(`/documents?q=${encodeURIComponent(text)}`)}
            />
          }
          actions={
            <>
              {developer && <StorageAlert report={storage.report} />}
              <CycleSwitcher cycles={cycles} value={activeCycle?.cycleId ?? null} onChange={setChosenCycleId} />
            </>
          }
        />
        {preview && <PreviewBanner onLogin={logout} />}
        {archived && activeCycle && (
          <ArchiveBanner
            name={activeCycle.name}
            editable={isDeveloper(user)}
            onBack={() => setChosenCycleId(currentCycle?.cycleId ?? null)}
          />
        )}
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
            // The developer can still add and change documents of a finished year.
            readOnly={archived && !isDeveloper(user)}
            storage={storage}
            onCyclesChanged={workspace.reload}
            data={data}
            user={user}
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
          archived={archived}
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
          cycleId={activeCycle?.cycleId}
          preview={preview}
          onClose={dialogs.closeUpload}
          onSaved={handleSaved}
        />
      )}
      {dialogs.showSession && <SessionForm preview={preview} onClose={dialogs.closeSession} onSaved={handleSaved} />}
      {dialogs.voteSession && (
        <VoteDialog
          archived={archived}
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
