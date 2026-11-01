import type { AppContext } from '../http/context.js';
import { fail } from '../http/errors.js';

/** The cycle that receives new documents and vote sessions. */
export async function getCurrentCycleId(query: AppContext['query']): Promise<number> {
  const [row] = await query('SELECT "CycleId" AS id FROM "Cycles" WHERE "IsCurrent"');
  return row?.id ?? fail(409, 'لا توجد دورة حالية. أنشئ دورة جديدة أولًا.');
}

/** Documents and votes of finished cycles stay visible but are read-only (except for the developer). */
export const ARCHIVED_MESSAGE = 'هذا العنصر ضمن دورة سابقة وهو للقراءة فقط.';
