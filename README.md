# Yod workspace redesign

Arabic-first, right-to-left workspace for the Yemeni Students Union in Sakarya.
This implementation lives alongside the original Angular frontend and ASP.NET
backend on `redesign/react-express`.

## Stack and structure

- React 19, Vite 7, TypeScript, React Router, and Lucide icons.
- Express 5 with TypeScript, Zod request validation, and Multer uploads.
- PostgreSQL through `pg` and parameterized SQL. The existing table and column
  names are retained; Prisma and new database migrations are not required.
- Cloudinary for uploaded document files.
- Custom responsive CSS and Noto Sans Arabic. The font is loaded from Google
  Fonts; Tahoma/Arial remain available as fallbacks.

`src/` contains the frontend, `server/` contains the API, `public/` holds the
retained union logo, and `DESIGN.md` records the visual direction.

## Run locally

Use Node.js 22.12 or newer on the Node 22 line, with npm installed.
Run these commands from this directory:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open <http://localhost:5173>. The API listens on
<http://localhost:3001>; Vite proxies `/api` to it so browser requests use the
same origin. If either process exits, the combined development command stops
the other process. The original app can remain on its existing ports.

The login page also offers **استكشف التصميم**. This is a clearly marked,
read-only preview using illustrative data. It does not authenticate a real
account or write to PostgreSQL or Cloudinary.

## Environment settings

The API automatically reads `../Yod_System.env`. You can copy `.env.example` to
`.env` for local overrides. Neither file should be committed with credentials.
Precedence is: existing process environment, then `redesign/.env`, then the
root `Yod_System.env`. Standard Node variable names take priority over their
legacy equivalents when both are set.

| Setting | Purpose / fallback |
| --- | --- |
| `PORT` | API port; defaults to `3001` |
| `HOST` | Listener address; defaults to loopback in development and `0.0.0.0` in production |
| `APP_ORIGIN` | Exact browser origin allowed to submit changes; defaults to `http://localhost:5173` |
| `NODE_ENV` | `development` locally; `production` enables secure cookies and serves the frontend build |
| `DATABASE_URL` | Standard PostgreSQL URL; otherwise `ConnectionStrings__DefaultConnection` is parsed |
| `JWT_SECRET` | Session signing secret of at least 32 characters; falls back to `Jwt__Key` |
| `CLOUDINARY_URL` | Destination account URL supplied by Cloudinary; used before legacy settings |
| `CLOUDINARY_CLOUD_NAME` | Falls back to `Cloudinary__CloudName` |
| `CLOUDINARY_API_KEY` | Falls back to `Cloudinary__ApiKey` |
| `CLOUDINARY_API_SECRET` | Falls back to `Cloudinary__ApiSecret` |
| `AUTH_PROVIDER` | `legacy` by default; set to `neon` only after destination migration and auth setup |
| `NEON_AUTH_URL` | Public HTTPS Managed Better Auth base URL, without a trailing slash |

Explicit `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
override their corresponding `CLOUDINARY_URL` values. Retained legacy Cloudinary
credentials allow downloads of old document links while assets are being copied.

## Environment migration

`server/migration-inventory.ts` inspects service counts without changing records.
The explicitly invoked `server/migrate-environment.ts` copies the original database
from `../Yod_System.env` into `MIGRATION_DATABASE_URL`, then copies Cloudinary
original assets into an isolated folder in the new account. It refuses to overwrite
an occupied destination database or pre-existing target assets. It never deletes
source records or files. Run it only for an intentionally authorized migration.

The migration keeps a database backup and resumable checkpoints in ignored
`.migration-data/`. Those contain private application data and must not be committed
or shared. Table counts and content fingerprints are checked before switching the
local `.env` to the destination database. Existing local files are copied when
available; missing historical files are reported and their document records retained.
Cloudinary transformations are regenerated on demand; account settings and billing
are not copied. The operation is a snapshot, not continuous synchronization.

`ASPNETCORE_ENVIRONMENT`, legacy CORS variables, and
`Database__ApplyMigrationsOnStartup` do not control this Node app. No schema
creation, seeding, or migration runs on startup. Configure a database that
already contains the original tables and seeded roles/types/quarters.

## Accounts and permissions

The following cookie/password behavior describes the default `legacy` provider.

Sessions use a one-day signed JWT in an HTTP-only, SameSite=Lax cookie scoped
to `/api`. Tokens are not stored in browser local storage. The API reloads the
account's role from PostgreSQL for authenticated requests. Mutating requests
must include an `Origin` matching `APP_ORIGIN`.

Existing legacy plaintext passwords remain readable for compatibility with the
original app. New registrations use salted scrypt hashes. Logging in does not
rewrite an existing account. A separate password migration is still needed to
remove the legacy password format; the old ASP.NET login cannot authenticate
new scrypt accounts without a matching update.

Self-registration grants only the existing observer role (`RoleId=10`). The UI
does not let a registrant assign themselves a leadership role. Role assignment
administration is not included in this redesign.

- Authenticated members can read documents across committees, matching the
  existing document visibility behavior.
- Document creation uses `RoleDocPerms` to check the actor's allowed types.
- A document owner or role 1, 3, or 4 can edit/delete it. Editing checks the
  owner's allowed document types and clears earlier reviews.
- Proposal reviews require role 1, 3, or 4. The final status is set after all
  three roles have reviewed the proposal.
- Roles 1 and 3 can create voting sessions. A creator or either leadership role
  can close/delete a session. Each member can replace their vote while a session
  remains open and before its deadline. A tied result is recorded as a tie.

## Neon Auth

Managed Neon Auth is optional. Complete and verify the service migration before
running this explicit setup against the destination `DATABASE_URL`:

```powershell
npm.cmd run auth:setup
```

This creates the `AuthIdentities` mapping table; it does not run at application
startup. Then enable `AUTH_PROVIDER=neon` with the configured `NEON_AUTH_URL` and
restart the API. `/api/auth/config` reports the public provider and auth URL to
the browser. Neon mode disables the API's local login/registration handlers.

The API verifies managed EdDSA JWTs against the auth endpoint's JWKS, checking
issuer, audience, expiry, subject, verified email, and account ban status. A
uniquely matching verified email links to an existing user while preserving
their role. Duplicate existing email matches are rejected for manual resolution;
new accounts receive observer role 10. Existing members must sign up and verify
the same email address once to link their existing user and role. Managed-auth
passwords must be created or reset through Neon Auth; legacy passwords are not
copied into the auth service. The managed-auth frontend includes email
verification and password-reset flows.

## Checks

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run check:db
```

`build` type-checks the frontend and backend, then builds the frontend into
`dist/`. `test` runs the backend test suite. `check:db` checks the configured
database with read-only queries; it is not a migration command. The health
endpoint is `GET /api/health`.

Verification completed for this implementation:

- All 24 backend tests passed, including the Neon Auth integration checks.
- The read-only database check passed the actual document and voting SELECTs,
  authentication schema check, and catalog reads: 10 roles, 5 document types,
  4 quarters, and 26 role/type permissions. Verification made no remote writes.
- Browser visual QA remains incomplete: the in-app browser host was unavailable,
  and Windows automation was stopped when the target URL could not be confirmed
  confidently. Responsive appearance and browser interactions still need a
  visual review; successful build/API checks alone do not establish that review.

## Production serving

The current startup command runs TypeScript with `tsx`, which is a development
dependency. Install build/runtime dependencies with `npm ci --include=dev`, run
`npm run build`, and then run `npm start` with production environment variables:

```powershell
$env:NODE_ENV = 'production'
$env:APP_ORIGIN = 'https://your-domain.example'
npm.cmd start
```

Express serves `dist/` and the `/api` endpoints from one origin. It binds to
`0.0.0.0` in production for container/platform access; `HOST` overrides the
listener address. Put an HTTPS reverse proxy or the hosting platform's HTTPS
endpoint in front of it. HTTPS is required for the production session cookie.
Keep `APP_ORIGIN` equal to the external browser origin, without a trailing slash.

This branch does not change or deploy the existing Vercel/Render services.
Their original deployment configuration does not automatically deploy this
new `redesign/` app.

## Current limits

- Login, registration, document/review changes, and voting use the configured
  database. When it points to production, those are real operations. The design
  preview is the option for reviewing appearance without writes.
- Uploads are limited to 100 MB. Deleted/replaced document records leave the
  original Cloudinary asset in place for recovery; asset cleanup is separate.
- Historical local files can be downloaded when retained under the original
  `Yod_MS3/wwwroot/` directory. The API rejects paths outside that directory;
  files absent from the server still need recovery from the original deployment.
  Cloudinary downloads retry eligible raw-upload URLs with a signed URL when
  the first request fails and Cloudinary credentials are configured.
- Voting deadlines stop new votes, but a permitted member must close a session
  to persist its final decision. There is no background auto-close worker.
- API responses currently load the document and voting collections together;
  document search/pagination happens in the browser. Large datasets will need
  server-side pagination.
- Password reset and email verification are available through Neon Auth when
  that provider is enabled; the legacy provider does not provide these flows.
  No role-assignment screen, audit log, notifications service, or new deployment
  pipeline is included.

## Deploying to Vercel

The React app is built by Vite into `dist/` and served statically; the Express API runs as a single
serverless function (`api/index.ts`) behind the `/api/*` rewrite in `vercel.json`.

1. Import the repository in Vercel (framework preset: Vite; no root directory change needed).
2. Add these environment variables (Production and Preview):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string (use the pooled host) |
| `CLOUDINARY_URL` | `cloudinary://<key>:<secret>@<cloud-name>` for document storage |
| `APP_ORIGIN` | The deployed site origin, e.g. `https://yod-system.vercel.app`; non-GET API calls from any other origin are rejected |
| `AUTH_PROVIDER` | `neon` (managed auth) or `legacy` (username/password cookie) |
| `NEON_AUTH_URL` | Required when `AUTH_PROVIDER=neon` |
| `JWT_SECRET` | 32+ characters; required when `AUTH_PROVIDER=legacy` |

3. Deploy. Never commit `.env`, `Yod_System.env` or `.migration-data/`.

Limitation: Vercel functions accept request bodies up to about 4.5 MB, so document uploads larger than that
fail on Vercel even though the API itself allows 100 MB. Larger files need browser-to-Cloudinary signed uploads.

## Developer role and yearly cycles

- **Developer (role 11)** administers the whole system from `/admin`: add users or hand a seat to a new person
  (edit the account in place), start a new yearly cycle, and watch storage. Only the developer can delete documents
  and vote sessions.
- **Cycles.** Every document and vote session belongs to a cycle (union year). Only the current cycle accepts new
  uploads, votes and reviews; earlier cycles stay visible to everyone but read-only. Starting a new cycle never
  deletes anything.
- **Storage bar.** The developer sees file storage (Cloudinary) and database size (Neon) in the top bar, with
  warnings at 75 % and 90 %. Limits default to 25 GB / 512 MB; override with `STORAGE_CLOUDINARY_LIMIT_GB` and
  `STORAGE_DB_LIMIT_MB`.

First-time setup after pulling this version:

```bash
npm run db:upgrade        # adds cycles + developer role; existing data becomes the 2025/2026 archive
DEV_USERNAME=... DEV_EMAIL=... DEV_FULLNAME=... DEV_PASSWORD=... npm run create-developer
```

Handing a seat to a new person: edit the user, change name/username/email and set a new password. The old password
and any open sessions stop working. In Neon-auth mode the previous person's identity is unlinked, and the new person
signs up with the new email.

## Oversight committee

The old observer role is now the oversight committee: **رئيس لجنة الرقابة** (10), **نائب رئيس لجنة الرقابة** (12)
and **المقرر** (13). They can view documents like any member and upload **reports only**.
What they upload is private to the three of them (and the developer) until the other two have accepted it; then
everyone can see it. Assign the three roles from the developer console. Self-registration is closed: the developer
creates every account.

Deleting a whole year (developer console, "Years") removes its documents, reviews, vote sessions and uploaded files
after typing the year's name to confirm.

## Documentation

- `AGENTS.md`: architecture, business rules, API and conventions for AI agents and developers.
- `docs/`: Arabic PDF guide and two PowerPoint decks (members / full). See `docs/README.md`.
