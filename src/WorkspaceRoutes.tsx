import { Navigate, Route, Routes } from 'react-router-dom';
import { isDeveloper } from './lib/roles';
import { AdminPage } from './pages/AdminPage';
import { CalendarPage } from './pages/CalendarPage';
import { CommitteesPage } from './pages/CommitteesPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { OverviewPage } from './pages/OverviewPage';
import { VotesPage } from './pages/VotesPage';
import type { Data, Document, StorageReport, User, VoteSession } from './types';

type Props = {
  /** Data already narrowed to the cycle being viewed. */
  data: Data;
  user: User;
  loading: boolean;
  /** Browsing a finished cycle: hide the create buttons. */
  readOnly: boolean;
  storage: { report: StorageReport | null; error: string; loading: boolean; reload: () => void };
  onUpload: () => void;
  onCreateSession: () => void;
  onDocument: (document: Document) => void;
  onVote: (session: VoteSession) => void;
  onCyclesChanged: () => Promise<void>;
};

/** Route table for the signed-in workspace. Unknown paths fall back to the overview. */
export function WorkspaceRoutes({
  data,
  user,
  loading,
  readOnly,
  storage,
  onUpload,
  onCreateSession,
  onDocument,
  onVote,
  onCyclesChanged,
}: Props) {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <OverviewPage
            data={data}
            user={user}
            loading={loading}
            readOnly={readOnly}
            onUpload={onUpload}
            onDocument={onDocument}
            onVote={onVote}
          />
        }
      />
      {/* "key" resets the page's filters/pagination when switching between documents and reviews. */}
      <Route
        path="/documents"
        element={
          <DocumentsPage
            key="documents"
            data={data}
            loading={loading}
            readOnly={readOnly}
            onUpload={onUpload}
            onDocument={onDocument}
          />
        }
      />
      <Route
        path="/reviews"
        element={
          <DocumentsPage
            key="reviews"
            data={data}
            loading={loading}
            reviews
            readOnly={readOnly}
            onUpload={onUpload}
            onDocument={onDocument}
          />
        }
      />
      <Route
        path="/votes"
        element={<VotesPage data={data} user={user} readOnly={readOnly} onCreate={onCreateSession} onSelect={onVote} />}
      />
      <Route path="/calendar" element={<CalendarPage data={data} onDocument={onDocument} />} />
      <Route path="/committees" element={<CommitteesPage data={data} />} />
      {isDeveloper(user) && (
        <Route path="/admin" element={<AdminPage data={data} storage={storage} onCyclesChanged={onCyclesChanged} />} />
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
