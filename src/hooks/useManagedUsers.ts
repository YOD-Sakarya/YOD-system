import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ManagedUser } from '../types';

/** The account list, loaded once for the developer (it feeds the workspace search). */
export function useManagedUsers(enabled: boolean) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api<ManagedUser[]>('/users')
      .then(list => {
        if (active) setUsers(list);
      })
      .catch(() => {
        // Search simply goes without people when this fails.
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return users;
}
