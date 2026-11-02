export type User = { userId: number; fullName: string; roleId: number; roleName: string; mustChangePassword?: boolean };
/** A yearly cycle (union year). Only the current cycle accepts new documents and votes. */
export type Cycle = {
  cycleId: number;
  name: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  documentCount: number;
  voteCount: number;
};
export type Review = {
  reviewId: number;
  reviewerId: number;
  reviewerName: string;
  roleId: number;
  roleName: string;
  decision: string;
  comment: string;
  reviewedAt: string;
};
export type Document = {
  docId: number;
  title: string;
  ownerUserId: number;
  ownerName: string;
  roleId: number;
  roleName: string;
  docTypeId: number;
  typeName: string;
  quarterId: number;
  quarterName: string;
  status: string;
  eventDate: string;
  createdAt: string;
  cycleId: number;
  reviews: Review[];
};
export type VoteSession = {
  sessionId: number;
  title: string;
  description: string;
  kind: 'اجتماع' | 'قرار';
  status: string;
  decision: string | null;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
  cycleId: number;
  closedAt: string | null;
  voteCount: number;
  myOptionId: number | null;
  myComment?: string | null;
  options: { optionId: number; text: string; count: number }[];
};
export type Catalog = {
  roles: { roleId: number; roleName: string }[];
  types: { docTypeId: number; typeName: string }[];
  quarters: { quarterId: number; quarterName: string }[];
  permissions: { roleId: number; docTypeId: number }[];
};
export type Data = { documents: Document[]; votes: VoteSession[]; catalog: Catalog; cycles: Cycle[] };
/** Account row shown in the developer's user administration. */
export type ManagedUser = {
  userId: number;
  fullName: string;
  username: string;
  email: string;
  phoneWhatsapp: string;
  roleId: number;
  roleName: string;
  createdAt: string;
  documentCount: number;
};
export type UsageLevel = 'ok' | 'warning' | 'critical' | 'full';
export type Usage = { usedBytes: number; limitBytes: number; percent: number; level: UsageLevel };
export type StorageReport = {
  files: (Usage & { plan: string | null; files: number }) | null;
  database: Usage | null;
  errors: { files: string | null; database: string | null };
};
