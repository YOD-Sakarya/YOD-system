import { useCallback, useState } from 'react';
import type { Document, VoteSession } from '../types';

/** Open/close state for the document, upload/edit, new-session and vote dialogs. */
export function useDialogs() {
  const [viewedDocument, setViewedDocument] = useState<Document | null>(null);
  const [editedDocument, setEditedDocument] = useState<Document | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [voteSession, setVoteSession] = useState<VoteSession | null>(null);

  const closeDocument = useCallback(() => setViewedDocument(null), []);
  const closeUpload = useCallback(() => {
    setShowUpload(false);
    setEditedDocument(null);
  }, []);
  const closeSession = useCallback(() => setShowSession(false), []);
  const closeVote = useCallback(() => setVoteSession(null), []);
  const closeAll = useCallback(() => {
    closeDocument();
    closeUpload();
    closeSession();
    closeVote();
  }, [closeDocument, closeUpload, closeSession, closeVote]);
  const openUpload = useCallback(() => setShowUpload(true), []);
  const openSession = useCallback(() => setShowSession(true), []);
  const editDocument = useCallback((document: Document) => {
    setViewedDocument(null);
    setEditedDocument(document);
    setShowUpload(true);
  }, []);

  return {
    viewedDocument,
    editedDocument,
    showUpload,
    showSession,
    voteSession,
    viewDocument: setViewedDocument,
    viewVote: setVoteSession,
    openUpload,
    openSession,
    editDocument,
    closeDocument,
    closeUpload,
    closeSession,
    closeVote,
    closeAll,
  };
}
