import { v2 as cloudinary } from 'cloudinary';
import type { AppContext } from '../http/context.js';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export type UsageLevel = 'ok' | 'warning' | 'critical' | 'full';
export type Usage = { usedBytes: number; limitBytes: number; percent: number; level: UsageLevel };

/** Bar colour/message thresholds: warn from 75 %, critical from 90 %, full at 100 %. */
export function usageLevel(percent: number): UsageLevel {
  if (percent >= 100) return 'full';
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'warning';
  return 'ok';
}

export function toUsage(usedBytes: number, limitBytes: number): Usage {
  const percent = limitBytes > 0 ? Math.round((usedBytes / limitBytes) * 1000) / 10 : 0;
  return { usedBytes, limitBytes, percent, level: usageLevel(percent) };
}

/**
 * File storage on Cloudinary. The plan limit comes from the account's credits (1 credit = 1 GB of storage),
 * or from STORAGE_CLOUDINARY_LIMIT_GB when set (free plan: 25 GB).
 */
export async function cloudinaryUsage(): Promise<Usage & { plan: string | null; files: number }> {
  const usage = await cloudinary.api.usage();
  const configured = Number(process.env.STORAGE_CLOUDINARY_LIMIT_GB);
  const credits = Number(usage.credits?.limit);
  const limitGb = configured > 0 ? configured : credits > 0 ? credits : 25;
  return {
    ...toUsage(Number(usage.storage?.usage) || 0, limitGb * GB),
    plan: typeof usage.plan === 'string' ? usage.plan : null,
    files: Number(usage.resources) || 0,
  };
}

/** Database size on Neon. The limit comes from STORAGE_DB_LIMIT_MB (free plan: 512 MB). */
export async function databaseUsage(query: AppContext['query']): Promise<Usage> {
  const [row] = await query('SELECT pg_database_size(current_database())::float8 AS bytes');
  const limitMb = Number(process.env.STORAGE_DB_LIMIT_MB) > 0 ? Number(process.env.STORAGE_DB_LIMIT_MB) : 512;
  return toUsage(Number(row.bytes), limitMb * MB);
}
