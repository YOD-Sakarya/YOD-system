/** A session is open while its status is "open" and its closing time (if any) has not passed. */
export const isOpen = (s: { status: string; closedAt: string | null }) =>
  s.status === 'مفتوحة' && (!s.closedAt || new Date(s.closedAt).getTime() > Date.now());
