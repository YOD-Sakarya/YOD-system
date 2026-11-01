import { useEffect, useState } from 'react';

export function useToast(durationMs = 4500) {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), durationMs);
    return () => clearTimeout(timer);
  }, [toast, durationMs]);
  return { toast, showToast: setToast, clearToast: () => setToast('') };
}
