/** Revoked managed subjects stay blocked even while a previously issued JWT is still valid. */
export const authRevocationsSql = `CREATE TABLE IF NOT EXISTS "AuthRevocations" (
  "Provider" text NOT NULL,
  "Subject" text NOT NULL,
  "RevokedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("Provider", "Subject")
)`;
