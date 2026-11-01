import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '..', 'Yod_System.env'), quiet: true });

export function parseConnectionString(value: string) {
  const pairs = Object.fromEntries(value.split(';').filter(Boolean).map(part => {
    const equal = part.indexOf('=');
    return [part.slice(0, equal).trim().toLowerCase(), part.slice(equal + 1).trim()];
  }));
  return {
    host: pairs.host, port: Number(pairs.port || 5432), database: pairs.database,
    user: pairs.username, password: pairs.password,
    ssl: /require|verify/i.test(pairs['ssl mode'] || '')
      ? { rejectUnauthorized: !/^true$/i.test(pairs['trust server certificate'] || '') } : undefined,
  };
}
function cloudinaryFromUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'cloudinary:' || !url.hostname || !url.username || !url.password) throw new Error();
    return { cloud_name: url.hostname, api_key: decodeURIComponent(url.username), api_secret: decodeURIComponent(url.password) };
  } catch { throw new Error('CLOUDINARY_URL must contain a valid cloudinary://key:secret@cloud-name URL.'); }
}
const urlCloud = cloudinaryFromUrl(process.env.CLOUDINARY_URL);
const authProvider = process.env.AUTH_PROVIDER || 'legacy';
if (authProvider !== 'legacy' && authProvider !== 'neon') throw new Error('AUTH_PROVIDER must be legacy or neon.');
function neonAuthUrl(value: string | undefined) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/+$/, '');
  } catch { throw new Error('NEON_AUTH_URL must be an HTTPS Managed Better Auth endpoint without credentials, query, or fragment.'); }
}
export const legacyCloud = {
  cloud_name: process.env.Cloudinary__CloudName,
  api_key: process.env.Cloudinary__ApiKey,
  api_secret: process.env.Cloudinary__ApiSecret,
};
export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  origin: process.env.APP_ORIGIN || 'http://localhost:5173',
  production: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET || process.env.Jwt__Key || '',
  authProvider: authProvider as 'legacy' | 'neon',
  neonAuthUrl: neonAuthUrl(process.env.NEON_AUTH_URL),
  database: process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : parseConnectionString(process.env.ConnectionStrings__DefaultConnection || ''),
  cloud: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || urlCloud?.cloud_name || legacyCloud.cloud_name,
    api_key: process.env.CLOUDINARY_API_KEY || urlCloud?.api_key || legacyCloud.api_key,
    api_secret: process.env.CLOUDINARY_API_SECRET || urlCloud?.api_secret || legacyCloud.api_secret,
  },
};
