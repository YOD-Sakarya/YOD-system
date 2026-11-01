import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

// Vercel invokes the exported Express app per request (serverless); it is never started with listen().
if (config.authProvider === 'legacy' && config.jwtSecret.length < 32)
  throw new Error('Set JWT_SECRET or Jwt__Key to at least 32 characters.');
if (config.authProvider === 'neon' && !config.neonAuthUrl)
  throw new Error('Set NEON_AUTH_URL before enabling AUTH_PROVIDER=neon.');

export default createApp();
