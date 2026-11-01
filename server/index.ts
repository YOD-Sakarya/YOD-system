import { createApp } from './app.js';
import { config } from './config.js';
if (config.authProvider === 'legacy' && config.jwtSecret.length < 32) throw new Error('Set JWT_SECRET or Jwt__Key to at least 32 characters.');
if (config.authProvider === 'neon' && !config.neonAuthUrl) throw new Error('Set NEON_AUTH_URL before enabling AUTH_PROVIDER=neon.');
const app = createApp();
app.listen(config.port, config.host, () => console.log(`Yod API ready at http://localhost:${config.port}`));
