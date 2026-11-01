export type User = { userId: number; fullName: string; roleId: number; roleName: string };
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
  reviews: Review[];
};
export type VoteSession = {
  sessionId: number;
  title: string;
  description: string;
  status: string;
  decision: string | null;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
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
export type Data = { documents: Document[]; votes: VoteSession[]; catalog: Catalog };
