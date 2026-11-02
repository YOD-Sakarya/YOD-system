# Better Auth and account management changes

This file records the work completed in this session. It distinguishes implemented code from configuration and live behavior that have not yet been verified.

## Login and password recovery

- Made Neon managed Better Auth the default authentication provider. Legacy authentication remains available through an explicit `AUTH_PROVIDER=legacy` setting.
- Configured the supplied Neon Auth endpoint in the ignored local `.env` file.
- Started the local frontend and API at `http://localhost:5173` and `http://localhost:3001`.
- Confirmed that the local API connects to the configured database.
- Connected the existing Arabic login, forgotten-password and reset-password screens to Better Auth.
- Added an email verification code screen, including code entry, resending and invalid-code feedback.
- Removed the account creation/activation option from the login page. Password recovery and the option to enter an already received code remain available.

## Activation flow

Implemented this sequence for provisioned managed accounts:

1. Enter the account email, or open the code screen after receiving an activation email.
2. Enter the emailed code.
3. After Neon validates the code, choose and confirm a new password.
4. Save the password and sign in automatically. If automatic sign-in fails, return to login with a confirmation message.

Activation uses Neon's password-reset OTP endpoints so the same code authorizes setting the new password. The code stays in component memory rather than browser storage or the URL. Refreshing the password step requires restarting activation.

The activation routes are `/auth/sign-up`, `/auth/activation-code` and `/auth/new-password`. Despite its retained route name, `/auth/sign-up` now starts activation for an existing managed account; it does not create an account.

## Developer login

- Created the Better Auth login for `sakarya@yod.org.tr`, using its existing developer seat in the workspace database.
- Generated a temporary password and marked that login as requiring a password change.
- Added a first-login password-change screen.
- Added server enforcement that prevents a temporary-password account from accessing workspace APIs before its managed password changes. Authenticated `GET /api/auth/me` remains available to display the required step.
- Kept email verification required. Verification and the final password change were not performed on the user's behalf.

No password or API key is included in this summary.

## Developer account management

Implemented the following behavior for Better Auth mode:

- The developer user form no longer asks for a password when creating or editing users.
- Creating a user provisions or reuses a managed Neon identity, binds it to the workspace seat, and requests an activation code after the database transaction commits.
- The member chooses their own password through the activation flow.
- Changing a seat's email provisions the replacement identity, revokes the previous mapped identities, and replaces the login mapping while retaining the same workspace user ID, documents and votes.
- Changing the username to hand over a seat requires a different email address.
- After a handover commits, the backend attempts to delete the old managed identity and send the new member an activation code.
- Name or role changes without an email change do not replace the managed identity or send an activation email.
- Added a developer action to send another activation/password-reset code to the account's currently saved email.
- Added `POST /api/users/:id/reset-password`, restricted to the developer in Better Auth mode.
- Added visible messages for activation-email and old-identity cleanup failures. These messages distinguish a saved account from an operation that failed before saving.
- Kept password entry for the explicit legacy authentication fallback.

## Revocation and database setup

- Ran `npm run auth:setup` against the connected database.
- Added the `AuthIdentities` mapping table and the `AuthRevocations` table through idempotent, transactional setup.
- Added creation of the revocation table to `server/upgrade-schema.ts`.
- Added a revocation check when resolving managed identities. A retired identity cannot regain workspace access merely because an earlier JWT is still valid.
- Added code to recreate a revoked managed identity when its email is intentionally reused during later provisioning.
- Managed identity creation and deletion use the Neon management API. The application does not directly edit Neon's managed authentication tables.

## Documentation and checks

- Updated `AGENTS.md`, `README.md`, `.env.example` and `docs/BETTER_AUTH.md` with the implemented authentication and account-management behavior.
- Added tests for provider selection, temporary-password restrictions, verification/activation screens, managed provisioning, seat handover, revocation, reset requests and email-delivery failures.
- The latest completed full test run passed **63 tests**.
- TypeScript checks passed during implementation.
- Production builds passed for the earlier login and activation changes. A final production build covering the latest provisioning edits has not yet been completed.

## Work not completed or verified

- No production deployment or Vercel environment update was completed.
- At the last configuration check, `NEON_API_KEY`, `NEON_PROJECT_ID` and `NEON_BRANCH_ID` were not configured locally. The management integration is implemented, but live automatic provisioning and deletion have not been exercised.
- Successful email delivery, code entry and password selection have not been verified end to end by the assistant.
- The Arabic PDF guide and PowerPoint decks were not regenerated. Work on their generation dependencies was interrupted.
- No Git commit was created.

## Follow-up: switch-over workflow (second session)

Decisions made with the owner: invite by code with self-activation as the fallback (D), seat changes replace the login on the
same seat (H1), switch everyone at once.

- **Safe default restored.** `AUTH_PROVIDER` defaults to `legacy` again; Better Auth is an explicit opt-in. `NEON_AUTH_URL` is already set on
  Vercel, so a "Better Auth unless told otherwise" default would have switched every member on the next deploy.
- **Self-activation fallback.** New public `POST /api/auth/activate` (`server/services/activation.ts`): creates the seat's Better Auth login if it
  is missing, links it, replaces the stored legacy password with a marker and mails the code. Always answers the same, rate limited, one code
  per email per minute. «تفعيل حسابي», the unverified-sign-in path and «resend» now use it instead of calling Better Auth directly.
- **Developer batch invitations.** `POST /api/users/invite-pending` and the «إرسال دعوات التفعيل» button (8 seats per press).
- **Email rules.** Placeholder/reserved domains (example.com, .test, .invalid…) and shared emails are never provisioned; Better Auth mode
  refuses to save them. The Users tab flags such seats and shows a banner.
- **Plain-text passwords.** Production stores 12 members' legacy passwords as plain text. `npm run db:hash-passwords` (dry run by default,
  `-- --apply` to write) replaces them with hashes. It has only been dry-run; nothing was changed.
- Tests: 71 pass; typecheck and production build pass.

Found while checking production (read-only): every member seat has the same placeholder email (`@example.com`), so nobody can activate
until the developer enters real emails; and the developer seat (id 13) is Better Auth only, so it cannot sign in with a password while the
site runs `legacy`. Neither was changed by this session. Still not done: Neon console steps and management key (see docs/BETTER_AUTH.md),
end-to-end email test, regenerating the PDF guide and decks (they describe the old login until the switch).
