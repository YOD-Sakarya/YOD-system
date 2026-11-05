import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config, root } from './config.js';
import { query as databaseQuery, transaction as databaseTransaction } from './db.js';
import { authenticate } from './http/authenticate.js';
import type { AppContext } from './http/context.js';
import { errorHandler } from './http/errorHandler.js';
import { HttpError } from './http/errors.js';
import type { NeonIdentity } from './neon-auth.js';
import { publicAuthRoutes, sessionRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { catalogRoutes } from './routes/catalog.js';
import { cycleRoutes } from './routes/cycles.js';
import { documentRoutes } from './routes/documents.js';
import { logRoutes } from './routes/logs.js';
import { reviewRoutes } from './routes/reviews.js';
import { storageUsageRoutes } from './routes/storageUsage.js';
import { userRoutes } from './routes/users.js';
import { voteRoutes } from './routes/votes.js';
import { createAudit } from './services/audit.js';
import type { ManagedAccounts } from './services/managedAccounts.js';

type Dependencies = {
  query?: typeof databaseQuery;
  transaction?: typeof databaseTransaction;
  authProvider?: 'legacy' | 'neon';
  verifyNeon?: (token: string) => Promise<NeonIdentity>;
  managedAccounts?: ManagedAccounts;
};

/** Content-Security-Policy for production; the Neon auth origin is allowed for browser-side sign-in calls. */
function securityHeaders(context: AppContext) {
  const connectSources = ["'self'"];
  if (context.authProvider === 'neon' && config.neonAuthUrl) connectSources.push(new URL(config.neonAuthUrl).origin);
  return helmet({
    contentSecurityPolicy: config.production
      ? {
          directives: {
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'img-src': ["'self'", 'data:'],
            'connect-src': connectSources,
            'upgrade-insecure-requests': null,
          },
        }
      : false,
  });
}

/**
 * Builds the Express app. Database access and Neon token verification can be replaced
 * through `dependencies`, which is how the tests run without a real database.
 */
export function createApp(dependencies: Dependencies = {}) {
  const query = dependencies.query || databaseQuery;
  const context: AppContext = {
    query,
    transaction: dependencies.transaction || databaseTransaction,
    authProvider: dependencies.authProvider || config.authProvider,
    audit: createAudit(query),
    verifyNeon: dependencies.verifyNeon,
    managedAccounts: dependencies.managedAccounts,
  };

  const app = express();
  app.disable('x-powered-by');
  // Vercel terminates TLS in front of the function; trust one proxy hop so client IPs (rate limiting) are correct.
  if (process.env.VERCEL) app.set('trust proxy', 1);
  app.use(securityHeaders(context));
  app.use(express.json({ limit: '1mb' }), cookieParser());

  // CSRF defence: state-changing requests must come from the app's own origin, either the configured
  // APP_ORIGIN or the host this request was sent to (browsers always send a truthful Origin header, so a
  // cross-site page can never match the host it is attacking). This keeps preview/custom domains working.
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const host = req.get('x-forwarded-host') || req.get('host');
    let sameHost = false;
    try {
      sameHost = !!origin && !!host && new URL(origin).host === host;
    } catch {
      // Malformed Origin header: treated as foreign.
    }
    if (origin !== config.origin && !sameHost) return next(new HttpError(403, 'مصدر الطلب غير مسموح.'));
    next();
  });

  // Public endpoints.
  app.get('/api/health', async (_req, res) => {
    await context.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  });
  app.use('/api/auth', publicAuthRoutes(context));

  // Everything below requires a session.
  app.use('/api', authenticate(context));
  app.use('/api/auth', sessionRoutes());
  app.use('/api/account', accountRoutes(context));
  app.use('/api/catalog', catalogRoutes(context));
  app.use('/api/documents', documentRoutes(context));
  app.use('/api/reviews', reviewRoutes(context));
  app.use('/api/votes', voteRoutes(context));
  app.use('/api/cycles', cycleRoutes(context));
  // Developer-only administration.
  app.use('/api/users', userRoutes(context));
  app.use('/api/storage', storageUsageRoutes(context));
  app.use('/api/logs', logRoutes(context));
  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'المسار غير موجود.' });
  });

  // Self-hosted production: serve the built frontend with an SPA fallback (on Vercel the CDN does this).
  if (config.production && existsSync(path.join(root, 'dist'))) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  }

  app.use(errorHandler);
  return app;
}
