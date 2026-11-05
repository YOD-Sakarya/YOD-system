import type { query as databaseQuery, transaction as databaseTransaction } from '../db.js';
import type { Actor } from '../security.js';
import type { NeonIdentity } from '../neon-auth.js';
import type { Audit } from '../services/audit.js';
import type { ManagedAccounts } from '../services/managedAccounts.js';

declare global {
  namespace Express {
    interface Request {
      /** The authenticated user, set by the authentication middleware. */
      actor: Actor;
    }
  }
}

/** Dependencies shared by all routers; tests replace the database and Neon verification. */
export type AppContext = {
  query: typeof databaseQuery;
  transaction: typeof databaseTransaction;
  authProvider: 'legacy' | 'neon';
  /** Records who did what (see services/audit.ts); never throws. */
  audit: Audit;
  verifyNeon?: (token: string) => Promise<NeonIdentity>;
  managedAccounts?: ManagedAccounts;
};
