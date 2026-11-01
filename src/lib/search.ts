import type { Cycle, Document, ManagedUser, VoteSession } from '../types';
import type { CommandDef } from './commands';
import { date } from './format';

/* ---------- Arabic-friendly text matching ---------- */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Maps one character to its search form: '' means the character is ignored (diacritics, tatweel). */
function foldChar(char: string): string {
  if (/[ً-ٰٟـ]/.test(char)) return '';
  const arabicDigit = ARABIC_DIGITS.indexOf(char);
  if (arabicDigit >= 0) return String(arabicDigit);
  const persianDigit = PERSIAN_DIGITS.indexOf(char);
  if (persianDigit >= 0) return String(persianDigit);
  switch (char) {
    case 'أ':
    case 'إ':
    case 'آ':
    case 'ٱ':
      return 'ا';
    case 'ى':
    case 'ئ':
      return 'ي';
    case 'ة':
      return 'ه';
    case 'ؤ':
      return 'و';
    default:
      return char.toLowerCase();
  }
}

/** Folded text plus, for every folded character, its index in the original (used for highlighting). */
function foldWithMap(text: string) {
  let folded = '';
  const map: number[] = [];
  [...text].forEach((char, index) => {
    const out = foldChar(char);
    for (const c of out) {
      folded += c;
      map.push(index);
    }
  });
  return { folded, map };
}

/** Lower-cases and folds spelling variants so "اداره" finds "إدارة" and "١٢" finds "12". */
export const normalize = (text: string) => foldWithMap(text).folded;

/** Search terms: folded, whitespace separated, empty ones dropped. */
export const toTerms = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

/** True when every term appears somewhere in the text (order independent). */
export function matchesText(text: string, query: string) {
  const terms = toTerms(query);
  if (!terms.length) return true;
  const folded = normalize(text);
  return terms.every(term => folded.includes(term));
}

export type Segment = { text: string; match: boolean };

/** Splits the original text into plain and matching parts so the dropdown can highlight the terms. */
export function highlight(text: string, query: string): Segment[] {
  const terms = toTerms(query);
  if (!terms.length) return [{ text, match: false }];
  const { folded, map } = foldWithMap(text);
  const original = [...text];
  const marked = new Array<boolean>(original.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (let at = folded.indexOf(term, from); at >= 0; at = folded.indexOf(term, from)) {
      for (let i = at; i < at + term.length; i++) marked[map[i]] = true;
      from = at + term.length;
    }
  }
  const segments: Segment[] = [];
  original.forEach((char, index) => {
    const last = segments[segments.length - 1];
    if (last && last.match === marked[index]) last.text += char;
    else segments.push({ text: char, match: marked[index] });
  });
  return segments;
}

/* ---------- Search index ---------- */

export type SearchGroup = 'pages' | 'actions' | 'documents' | 'votes' | 'committees' | 'users';
export type SearchAction =
  | { type: 'document'; document: Document }
  | { type: 'vote'; session: VoteSession }
  | { type: 'path'; to: string }
  /** Something the app itself runs (open a dialog, sign out). */
  | { type: 'command'; command: 'upload' | 'new-session' | 'logout' };

export type SearchResult = {
  key: string;
  group: SearchGroup;
  title: string;
  subtitle: string;
  /** Short label on the right of the row, e.g. the year of an archived document. */
  badge?: string;
  action: SearchAction;
};

type Entry = SearchResult & { titleFolded: string; extraFolded: string; recency: number };

export const GROUP_LABELS: Record<SearchGroup, string> = {
  pages: 'الصفحات',
  actions: 'الإجراءات',
  documents: 'المستندات',
  votes: 'جلسات التصويت',
  committees: 'اللجان',
  users: 'المستخدمون',
};
const GROUP_ORDER: SearchGroup[] = ['pages', 'actions', 'documents', 'votes', 'committees', 'users'];
const GROUP_LIMIT: Record<SearchGroup, number> = {
  pages: 3,
  actions: 5,
  documents: 6,
  votes: 3,
  committees: 3,
  users: 4,
};

type IndexSource = {
  documents: Document[];
  votes: VoteSession[];
  cycles: Cycle[];
  roles: { roleId: number; roleName: string }[];
  pages: { to: string; label: string }[];
  /** Things the user can do (see lib/commands.ts). */
  commands: CommandDef[];
  /** Only the developer receives users. */
  users?: ManagedUser[];
  /** Roles shown as committees (the developer role is not one). */
  isCommittee: (role: { roleId: number }) => boolean;
};

const time = (value: string) => new Date(value).getTime() || 0;

/** Builds a searchable list of everything the signed-in user may open from the search box. */
export function buildSearchIndex(source: IndexSource): Entry[] {
  const cycleName = new Map(source.cycles.map(cycle => [cycle.cycleId, cycle]));
  const entries: Entry[] = [];
  const add = (result: SearchResult, extra: string, recency = 0) =>
    entries.push({ ...result, titleFolded: normalize(result.title), extraFolded: normalize(extra), recency });

  for (const page of source.pages)
    add(
      {
        key: `page:${page.to}`,
        group: 'pages',
        title: page.label,
        subtitle: 'فتح الصفحة',
        action: { type: 'path', to: page.to },
      },
      '',
    );

  for (const command of source.commands)
    add(
      {
        key: `cmd:${command.key}`,
        group: 'actions',
        title: command.title,
        subtitle: command.subtitle,
        action: command.action,
      },
      command.keywords,
    );

  for (const doc of source.documents) {
    const cycle = cycleName.get(doc.cycleId);
    add(
      {
        key: `doc:${doc.docId}`,
        group: 'documents',
        title: doc.title,
        subtitle: `${doc.typeName} · ${doc.roleName}`,
        badge: cycle && !cycle.isCurrent ? cycle.name : undefined,
        action: { type: 'document', document: doc },
      },
      `${doc.typeName} ${doc.roleName} ${doc.ownerName} ${doc.status} ${doc.quarterName} ${cycle?.name ?? ''} ${date(doc.eventDate, { year: 'numeric' })}`,
      time(doc.createdAt),
    );
  }

  for (const session of source.votes) {
    const cycle = cycleName.get(session.cycleId);
    add(
      {
        key: `vote:${session.sessionId}`,
        group: 'votes',
        title: session.title,
        subtitle: session.decision ? `القرار: ${session.decision}` : session.status,
        badge: cycle && !cycle.isCurrent ? cycle.name : undefined,
        action: { type: 'vote', session },
      },
      `${session.description} ${session.createdByName} ${session.options.map(o => o.text).join(' ')}`,
      time(session.createdAt),
    );
  }

  for (const role of source.roles.filter(source.isCommittee))
    add(
      {
        key: `role:${role.roleId}`,
        group: 'committees',
        title: role.roleName,
        subtitle: 'مستندات اللجنة',
        action: { type: 'path', to: `/documents?role=${role.roleId}` },
      },
      '',
    );

  for (const user of source.users ?? [])
    add(
      {
        key: `user:${user.userId}`,
        group: 'users',
        title: user.fullName,
        subtitle: `${user.roleName} · ${user.username}`,
        action: { type: 'path', to: `/admin?tab=users&q=${encodeURIComponent(user.fullName)}` },
      },
      `${user.username} ${user.email} ${user.roleName}`,
    );

  return entries;
}

/** Higher is better: title prefix > word prefix > title substring > other fields. */
function scoreEntry(entry: Entry, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    if (entry.titleFolded.startsWith(term)) total += 100;
    else if (entry.titleFolded.includes(' ' + term)) total += 70;
    else if (entry.titleFolded.includes(term)) total += 50;
    else if (entry.extraFolded.includes(term)) total += 20;
    else return -1; // every term must match somewhere
  }
  return total;
}

/**
 * Searches the index. An empty query lists the pages (quick navigation); otherwise results are grouped,
 * ranked by relevance (newest first on ties) and capped per group.
 */
export function search(index: Entry[], query: string): SearchResult[] {
  const terms = toTerms(query);
  // Nothing typed yet: offer quick navigation and the first few actions.
  if (!terms.length)
    return [
      ...index.filter(entry => entry.group === 'pages'),
      ...index.filter(entry => entry.group === 'actions').slice(0, 5),
    ];
  const scored = index
    .map(entry => ({ entry, score: scoreEntry(entry, terms) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || b.entry.recency - a.entry.recency);
  return GROUP_ORDER.flatMap(group =>
    scored
      .filter(item => item.entry.group === group)
      .slice(0, GROUP_LIMIT[group])
      .map(item => item.entry),
  );
}

/** The searchable list built by buildSearchIndex. */
export type SearchIndex = ReturnType<typeof buildSearchIndex>;
