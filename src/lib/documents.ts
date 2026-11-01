import type { Document } from '../types';
import { matchesText } from './search';

/** Search across title, committee, type, owner and status (Arabic spelling variants are ignored). */
export const matchesDocument = (d: Document, query: string) =>
  matchesText(`${d.title} ${d.roleName} ${d.typeName} ${d.ownerName} ${d.status}`, query);
