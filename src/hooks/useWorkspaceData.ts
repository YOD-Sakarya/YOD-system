import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Data, User } from '../types';

export const emptyData: Data = {
  documents: [],
  votes: [],
  catalog: { roles: [], types: [], quarters: [], permissions: [] },
  cycles: [],
};

type Options = {
  user: User | null;
  preview: boolean;
  setUser: (user: User | null) => void;
  setError: (message: string) => void;
};

/** Loads documents, votes and the catalog; a version counter drops responses from superseded requests. */
export function useWorkspaceData({ user, preview, setUser, setError }: Options) {
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(false);
  const loadVersion = useRef(0);

  const reload = useCallback(async () => {
    if (preview || !user) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const [documents, votes, catalog, cycles] = await Promise.all([
        api<Data['documents']>('/documents'),
        api<Data['votes']>('/votes'),
        api<Data['catalog']>('/catalog'),
        api<Data['cycles']>('/cycles'),
      ]);
      if (version === loadVersion.current) setData({ documents, votes, catalog, cycles });
    } catch (error) {
      if (version !== loadVersion.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setData(emptyData);
      }
      setError(error instanceof Error ? error.message : 'تعذر تحميل البيانات.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [preview, user, setUser, setError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Discards the loaded data and invalidates any request still in flight. */
  const reset = useCallback(() => {
    loadVersion.current++;
    setData(emptyData);
    setLoading(false);
  }, []);

  return { data, setData, loading, reload, reset };
}
