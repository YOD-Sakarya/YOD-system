# Better Auth: login, activation and seat changes

Better Auth (Neon's managed auth) is **implemented but switched off**. Production keeps the old username/email +
password login until `AUTH_PROVIDER=neon` is set. Switching changes how every member signs in, so it is a planned
event (see "Switch-over"), never a side effect of a deploy.

## How the two systems fit together

- **Better Auth** owns the email, the password, email verification and the codes.
- **The workspace database** owns the *seat*: role, name, documents, votes.
- `AuthIdentities` links one Better Auth identity to one seat. `AuthRevocations` lists identities that were cut off.
- Sign-in: the member signs in with email + password at Better Auth, the browser sends the signed token with every API
  call, the API verifies it and finds the seat through the link. An email with no seat gets no access.
- In Better Auth mode sign-in is **by email only** (no username).

## Activation (chosen design: invite by code, with self-activation as the fallback)

Every member activates once: **email → emailed code → new password (confirmed) → signed in**.

1. **Invitation.** The developer adds a seat (name, username, email, role; no password). The server creates the
   member's Better Auth login, links it to the seat and Better Auth emails the code.
   For seats that already exist the developer presses **إرسال دعوات التفعيل** in the Users tab (8 seats per press;
   press again until none remain). A single seat can be re-sent from its edit form.
2. **Fallback.** If the code never arrived or expired, the member opens **تفعيل حسابي**, enters the email and a new
   code is sent. The server creates the login first if it is still missing. The page answers the same for every
   address, so it cannot be used to find out who is a member.
3. The code is checked, the member chooses a password (10+ characters) and is signed in. Better Auth verifies the
   email through the same code.

Rules that avoid conflicts between the seat and the login:

- One seat per email (case-insensitive). A shared email cannot be linked to a person, so such seats are skipped and
  listed; fix the email first.
- **Placeholder emails are refused** in Better Auth mode (`example.com`, `.test`, `.invalid`…): they can never receive a
  code. The Users tab marks seats with placeholder, invalid or shared emails.
- The seat's old stored password is replaced by a marker when its login is created, so a legacy password does not
  outlive the move.
- Limits: the public activation endpoint is rate limited (10 / 15 min per IP) and allows one code per email per minute.

## Changing the person on a seat (new year)

The developer edits the seat and enters the **new person's email** (a different one is required when the username changes).

1. In one transaction: the old person's identity is revoked and unlinked, the new identity is created and linked.
   The old person loses access immediately, even if an old token is still valid.
2. After the commit: the old identity is deleted from Neon and the new person receives a code. If either step fails
   the page says so; the seat itself is already saved and access is already revoked.
3. The seat keeps its documents and votes. Name or role changes alone never touch the login.

Changing the email of the *same* person is handled the same way (new login, new password).

## Forgot password

«نسيت كلمة المرور؟» → email → emailed link (valid 15 minutes) → new password with confirmation. The message is the same
whether or not the email exists. Email delivery and link expiry are handled by Neon.

## Switch-over checklist (all at once)

Do this in order. Nothing here changes production until step 7.

1. **Real emails.** Every seat needs its own real email. In the current data all 12 member seats still hold the same
   placeholder address. Fix them first: the Users tab flags them, and in the old login mode editing an email is safe.
2. **Neon console.** Enable Neon Auth on the branch of the production database; add `https://yodsakarya-system.vercel.app`
   to **Auth → Domains**; enable email verification and password-reset emails and check that a test email arrives.
3. **Management key.** Create a Neon API key and note the project ID and branch ID. Set `NEON_API_KEY`,
   `NEON_PROJECT_ID`, `NEON_BRANCH_ID` and `NEON_AUTH_URL` in Vercel (server side only).
4. `npm run auth:setup` and `npm run db:upgrade` against the production database (idempotent).
5. **Hash the old passwords** (see below) so rollback stays possible and nothing is stored in plain text.
6. **Test with the developer first.** Sign in with the developer email, change the temporary password, open the
   workspace and the Users tab.
7. Set `AUTH_PROVIDER=neon` in Vercel and redeploy. Announce it to the members.
8. Press **إرسال دعوات التفعيل** until none remain; members can also activate themselves from «تفعيل حسابي».
9. Check: a member signs in with their new password and sees their role and documents; an unregistered email cannot
   open `/api/auth/me`; an expired or reused link is refused.

**Rollback:** set `AUTH_PROVIDER=legacy` and redeploy. Members who did not activate yet sign in as before. Members who
activated have no old password any more (it was replaced when their login was created); the developer sets a new one
from the user edit form in the old mode. Better Auth passwords never update the old hashes.

## Old plain-text passwords (do this before the switch-over, and in any case)

Accounts migrated from the original .NET app still keep their password as plain text in the database.
`npm run db:hash-passwords` shows how many (changes nothing); `npm run db:hash-passwords -- --apply` replaces each with a
salted hash. Members notice nothing. It never prints a password.

## Temporary developer credentials

Provisioned temporary credentials are restricted on the server. After verifying their email and signing in, the member
must replace the temporary password before using any workspace API. The form needs the temporary password, a different
new password of at least 10 characters, and confirmation; Better Auth revokes other sessions when it is saved. The app
stores only a fingerprint of the initial managed credential in the seat's password marker, reads the managed credential
(read only) to confirm the change, then clears the marker. A reset by email also satisfies the requirement. This needs the API
database role to be able to read `neon_auth.account`; managed auth records are never edited directly.

## Known limits

- Email delivery, code entry and the Neon management calls have not been exercised end to end in production.
- Better Auth sign-in has no username; the account page tells members to use the reset flow for password changes.
- The per-email cooldown is kept in memory per server instance, so it is a speed bump, not a guarantee (Neon rate limits too).
