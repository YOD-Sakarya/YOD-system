import type { Document, User } from '../types';
import { isDeveloper } from './roles';
import { matchesText } from './search';

/** Search across title, committee, type, owner and status (Arabic spelling variants are ignored). */
export const matchesDocument = (d: Document, query: string) =>
  matchesText(`${d.title} ${d.roleName} ${d.typeName} ${d.ownerName} ${d.status}`, query);

/**
 * Mirrors the server rule: the developer can delete any document; its creator only until the others accepted it
 * and only in the current year.
 */
export const canDeleteDocument = (user: User, doc: Document, archived: boolean) =>
  isDeveloper(user) || (doc.ownerUserId === user.userId && doc.status !== 'مقبول' && !archived);
