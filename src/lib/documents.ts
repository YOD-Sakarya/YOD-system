import type { Document } from '../types';

/** Case-insensitive search across title, committee, type and owner. */
export const matchesDocument = (d: Document, query: string) =>
  `${d.title} ${d.roleName} ${d.typeName} ${d.ownerName}`.toLowerCase().includes(query.toLowerCase());
