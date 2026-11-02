import { config } from '../config.js';
import type { AppContext } from '../http/context.js';
import type { ManagedAccounts } from './managedAccounts.js';

/** One activation code per email per minute: the code only goes to the mailbox owner, but nobody should be able to flood it. */
const COOLDOWN_MS = 60_000;
const lastSent = new Map<string, number>();

/** Addresses reserved for documentation and tests (RFC 2606): they can never receive an activation code. */
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;
export const isDeliverableEmail = (email: string) => {
  const domain = email.trim().split('@')[1] ?? '';
  return domain.includes('.') && !RESERVED_DOMAIN.test(domain);
};

export type ActivationOutcome = 'sent' | 'skipped';

type Dependencies = { transaction: AppContext['transaction']; managed: ManagedAccounts };

const canProvision = () => Boolean(config.neonApiKey && config.neonProjectId && config.neonBranchId);

/**
 * Makes sure the seat that owns `email` has a Better Auth login and mails its owner an activation code.
 *
 * Used by both the member ("تفعيل حسابي" fallback) and the developer ("send invitations"):
 * - unknown or shared emails do nothing, so the public endpoint can answer the same way for every address;
 * - a seat without a login gets one created and linked, and its old stored password is replaced by a marker
 *   (a legacy password must not outlive the move to Better Auth);
 * - a seat that already has a login just receives a fresh code (this also covers "resend").
 */
export async function activateSeat(
  { transaction, managed }: Dependencies,
  rawEmail: string,
  options: { ignoreCooldown?: boolean } = {},
): Promise<ActivationOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!isDeliverableEmail(email)) return 'skipped';
  const now = Date.now();
  if (!options.ignoreCooldown) {
    const last = lastSent.get(email);
    if (last && now - last < COOLDOWN_MS) return 'skipped';
  }
  if (lastSent.size > 500) for (const [key, at] of lastSent) if (now - at > COOLDOWN_MS) lastSent.delete(key);
  lastSent.set(email, now);

  const provider = `neon:${config.neonAuthUrl}`;
  const seat = await transaction(async client => {
    // Same lock the sign-in linking uses, so activation and a first sign-in cannot both create/link at once.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`auth:email:${email}`]);
    const seats = (
      await client.query(
        'SELECT "UserId" AS id, "FullName" AS name FROM "Users" WHERE lower(btrim("Email"))=$1 LIMIT 2',
        [email],
      )
    ).rows;
    if (seats.length !== 1) return null;
    const linked = (
      await client.query('SELECT 1 FROM "AuthIdentities" WHERE "Provider"=$1 AND "UserId"=$2', [provider, seats[0].id])
    ).rowCount;
    if (!linked && canProvision()) {
      const identity = await managed.provision(email, seats[0].name);
      const inserted = await client.query(
        'INSERT INTO "AuthIdentities" ("Provider","Subject","UserId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [provider, identity.subject, seats[0].id],
      );
      if (inserted.rowCount)
        await client.query('UPDATE "Users" SET "PasswordHash"=$1 WHERE "UserId"=$2', [identity.marker, seats[0].id]);
    }
    return seats[0];
  });
  if (!seat) return 'skipped';
  await managed.sendActivation(email);
  return 'sent';
}
