import { Navigate, Route, Routes } from 'react-router-dom';
import { CalendarPage } from './pages/CalendarPage';
import { CommitteesPage } from './pages/CommitteesPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { OverviewPage } from './pages/OverviewPage';
import { VotesPage } from './pages/VotesPage';
import type { Data, Document, User, VoteSession } from './types';

type Props = {
  data: Data;
  user: User;
  query: string;
  loading: boolean;
  onUpload: () => void;
  onCreateSession: () => void;
  onDocument: (document: Document) => void;
  onVote: (session: VoteSession) => void;
};

/** Route table for the signed-in workspace. Unknown paths fall back to the overview. */
export function WorkspaceRoutes({ data, user, query, loading, onUpload, onCreateSession, onDocument, onVote }: Props) {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <OverviewPage
            data={data}
            user={user}
            query={query}
            loading={loading}
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
            query={query}
            loading={loading}
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
            query={query}
            loading={loading}
            reviews
            onUpload={onUpload}
            onDocument={onDocument}
          />
        }
      />
      <Route
        path="/votes"
        element={<VotesPage data={data} query={query} user={user} onCreate={onCreateSession} onSelect={onVote} />}
      />
      <Route path="/calendar" element={<CalendarPage data={data} query={query} onDocument={onDocument} />} />
      <Route path="/committees" element={<CommitteesPage data={data} query={query} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
