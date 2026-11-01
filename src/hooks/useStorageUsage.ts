import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { StorageReport } from '../types';

const REFRESH_MS = 5 * 60 * 1000;

/** Developer-only storage report (files on Cloudinary + database size), refreshed every five minutes. */
export function useStorageUsage(enabled: boolean) {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setReport(await api<StorageReport>('/storage'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر قراءة المساحة.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
    if (!enabled) return;
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, reload]);

  return { report, error, loading, reload };
}
