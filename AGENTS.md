# AGENTS.md: YOD Workspace (مساحة الاتحاد)

Read this first. It is the single source of truth about what the project is, how it is built, the business rules
it enforces, and how to change it safely. **If you change behaviour, update this file in the same commit.**

## 1. What this is

An Arabic-first (RTL) workspace for the **Yemeni Students Union in Sakarya** (اتحاد الطلاب اليمنيين في سكاريا, "YOD").
The executive committee and its committees use it to:

1. keep **documents** (reports, statements, minutes, plans, proposals) organised per committee and per **year (cycle)**;
2. run **reviews**: proposals need approval from three leadership roles; oversight-committee documents need approval
   from the other two oversight members before anyone else may see them;
3. hold **votes** on decisions;
4. be administered by one **developer** role (users, yearly cycles, deletions, storage).

Every year the people change, so accounts are *seats* that the developer hands to new people, and each year is an
archived **cycle** that stays readable but is no longer editable (except by the developer).

UI language is Arabic. Code, comments and this file are English. Domain words are kept in Arabic where they are
literally stored in the database (statuses, role names).

## 2. Stack and architecture

```
Browser (React 19 + Vite + React Router, RTL)
   │  fetch /api/*   (cookie session, or Bearer JWT in Neon mode)
   ▼
Express 5 app  (server/app.ts)  ── on Vercel it runs as ONE serverless function: api/index.ts
   │                     │
   ▼                     ▼
PostgreSQL (Neon)     Cloudinary (uploaded files, "raw" resources, folder yod_uploads)
   ▲
Neon Auth = managed Better Auth (optional second auth mode, see §8.6)
```

- Frontend: `src/` (Vite, TypeScript strict, plain CSS split in `src/styles/`). No UI framework; icons from `lucide-react`.
- Backend: `server/` (Express 5, zod validation, `pg` pool, helmet, express-rate-limit, multer memory uploads).
- Hosting: **Vercel** (static `dist/` + `api/index.ts`). `vercel.json` rewrites `/api/*` to the function and everything else to `index.html`.
- Production site: https://yodsakarya-system.vercel.app. Repo: `YOD-Sakarya/YOD-system` (public; **never commit secrets**).

## 3. Repository map

```
api/index.ts                 Vercel entry: validates auth env, exports createApp()
server/app.ts                createApp(): middleware order, mounts routers (see §9)
server/config.ts             env → config (loads .env then ../Yod_System.env if present)
server/db.ts                 pg Pool, query(), transaction(), documentSql / sessionsSql
server/security.ts           ROLE CONSTANTS + PERMISSION RULES (pure functions, unit tested)
server/schemas.ts            zod request schemas
server/http/                 errors (HttpError, fail, id), authenticate, requireDeveloper, errorHandler, context
server/routes/               auth, account, catalog, documents, reviews, votes, cycles, users, storageUsage
server/services/             storage (Cloudinary upload/download/delete), cycles, storageUsage
server/neon-auth.ts          Neon/Better Auth JWT verification + identity → user mapping
server/upgrade-schema.ts     idempotent DB upgrade (cycles, roles, permissions)  → npm run db:upgrade
server/create-developer.ts   creates/promotes the developer account              → npm run create-developer
server/migrate-environment.ts, migration-inventory.ts   one-off DB+Cloudinary migration tool (see MIGRATION.md)
src/App.tsx                  shell: session, data loading, dialogs, search wiring
src/WorkspaceRoutes.tsx      route table
src/pages/                   Overview, Documents (also /reviews), Votes, Calendar, Committees, Account, Admin
src/features/admin/          developer console panels (users, cycles, storage, delete-year dialog)
src/features/auth/           login screens (legacy + Neon)
src/components/              ui/, layout/, dialogs/, documents/, search/, admin/
src/hooks/                   data + UI hooks (useWorkspaceData, useDialogs, useCurrentUser, ...)
src/lib/                     api client, roles (client mirror), search + commands, format helpers
src/data/                    navigation, read-only demo data (the "استكشف التصميم" preview)
src/styles/                  base, controls, layout, dashboard, documents, votes, auth, modal, search, admin, account, responsive
docs/                        Arabic PDF guide + two PowerPoint decks (+ sources in docs/src)
```

## 4. Commands

```bash
npm ci                       # install
npm run dev                  # API on :3001 + Vite on :5173 (proxy /api → 3001)
npm test                     # 47+ unit tests: tsx --test server/*.test.ts src/lib/*.test.ts
npm run build                # tsc --noEmit && vite build
npm run db:upgrade           # idempotent schema/role upgrade (safe to re-run)
npm run create-developer     # needs DEV_USERNAME, DEV_EMAIL, DEV_FULLNAME, DEV_PASSWORD (10+ chars)
npm run check:db             # connectivity + sample queries
npm run auth:setup           # Neon mode only: creates the AuthIdentities table
```

Always run `npx tsc --noEmit && npm test && npm run build` before committing. Format with Prettier
(`.prettierrc.json`: printWidth 120, single quotes, `arrowParens: avoid`).

## 5. Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` (or `ConnectionStrings__DefaultConnection`) | Neon PostgreSQL |
| `CLOUDINARY_URL` (or `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, or `Cloudinary__*`) | file storage |
| `APP_ORIGIN` | site origin for the CSRF check (same-host Origin is also accepted) |
| `AUTH_PROVIDER` | `legacy` (default: username/email + password, cookie) or `neon` (managed Better Auth, explicit opt-in: it changes how every member signs in) |
| `NEON_AUTH_URL` | required when `AUTH_PROVIDER=neon` |
| `JWT_SECRET` (or `Jwt__Key`) | ≥ 32 chars, required in legacy mode |
| `STORAGE_CLOUDINARY_LIMIT_GB` (default from plan credits, else 25), `STORAGE_DB_LIMIT_MB` (default 512) | storage bar limits |
| `PORT`, `HOST`, `NODE_ENV`, `VERCEL` | runtime |

Secrets live in `.env` (git-ignored), Vercel project settings, and nowhere else. `.migration-data/` is private recovery data.

## 6. Data model (PostgreSQL, quoted PascalCase identifiers)

- `Users(UserId, RoleId, FullName, Username, Email, PhoneWhatsapp, PasswordHash, CreatedAt)`: a user row is a **seat**.
  `PasswordHash` is `scrypt:<salt>:<hash>`, or `!neon-managed:…` for accounts whose password is held by Better Auth.
- `Roles(RoleId, RoleName)`, `RoleDocPerms(RoleId, DocTypeId)`, `DocumentTypes`, `Quarters`.
- `Documents(DocId, OwnerUserId, DocTypeId, Title, EventDate, Status, QuarterId, FilePath, CycleId, CreatedAt)`.
  `FilePath` is a Cloudinary URL (legacy rows may hold a local `uploads/…` path).
- `Reviews(ReviewId, DocId, ReviewerUserId, Decision, Comment, ReviewedAt)`: one current review per reviewer per document.
- `VoteSessions(VoteSessionId, Title, Description, Decision, CreatedByUserId, CreatedAt, ClosedAt, Status, CycleId)`,
  `VoteOptions`, `Votes` (one vote per user per session, replaceable).
- `Cycles(CycleId, Name, StartDate, EndDate, IsCurrent, CreatedAt)`: a **unique partial index** guarantees at most one current cycle.
- `AuthIdentities(Provider, Subject, UserId, CreatedAt)`: Neon mode only (created by `auth:setup`).

Sequences: after a restore, make sure identity sequences are ≥ max id (this once broke inserts on `Users`).

## 7. Roles, types and statuses (stored literally)

| Id | Role (Arabic) | Group |
| --- | --- | --- |
| 1 | رئيس الهيئة التنفيذية | leadership, reviewer, vote manager |
| 2 | نائب الرئيس | leadership |
| 3 | أمين عام | leadership, reviewer, vote manager |
| 4 | مسؤول مالي | leadership, reviewer |
| 5-9 | علاقات، أكاديمي، أنشطة، طالبات، إعلامي | committees |
| 10 | رئيس لجنة الرقابة | oversight |
| 12 | نائب رئيس لجنة الرقابة | oversight |
| 13 | المقرر | oversight |
| 11 | مطوّر | **developer** |

Document types: 1 تصور (proposal), 2 تقرير (report), 3 بيان, 4 محضر, 5 خطة.
Upload permissions (`RoleDocPerms`): role 1 → 1,2,3; role 2 → 1,2; role 3 → 1,2,3,4; role 4 → 1,2; roles 5-9 → 1,2,5;
oversight 10/12/13 → **2 only**; developer → any type (bypass in code).
Document statuses: `قيد المراجعة` (pending), `مقبول` (accepted), `مرفوض` (rejected), `لا يحتاج إلى مراجعة` (no review needed).
Vote statuses: `مفتوحة`, `مغلقة`. Vote decision: winning option text, `تعادل` (tie) or `لا يوجد قرار`.

**Role ids are duplicated** in `server/security.ts` and `src/lib/roles.ts` (plus `server/routes/*` SQL literals `10,12,13`
and `1,3,4`). Change them together.

## 8. Business rules (enforced on the server; the UI only mirrors them)

### 8.1 Documents
- Upload: needs a `RoleDocPerms` row for the actor's role (developer: any). New documents go to the **current cycle**;
  only the developer may pass `cycleId` to upload into an archived cycle.
- Status on create/edit: pending if the document needs reviewers (see 8.2), otherwise `لا يحتاج إلى مراجعة`.
- Edit: owner, roles 1/3/4, or developer; non-developers only in the current cycle. **Editing clears all reviews** and resets the status.
- Delete: developer anything; the **owner** only while status ≠ `مقبول` **and** the document is in the current cycle
  (`canDeleteDocument`). Deleting one document does not remove its Cloudinary file; deleting a whole cycle does.
- Visibility: documents owned by oversight roles (10/12/13) with status ≠ `مقبول` are hidden (list, get, download → 404)
  from everyone except oversight roles and the developer.

### 8.2 Reviews (`POST /api/reviews`)
`requiredReviewerRoles(docTypeId, ownerRoleId)`:
- proposal (type 1) → roles **1, 3, 4**;
- any document owned by an oversight role → the **other two** oversight roles (the owner's acceptance is implied);
- otherwise none.
Reviewer must be in that set; only the current cycle; a reviewer's new review replaces their old one. Status =
pending until every required role has reviewed, then accepted only if all accepted, else rejected.

### 8.3 Votes
Create: roles 1, 3, developer; `closeAt` (optional) must be in the future; 2-10 distinct options. Everyone may vote;
a vote can be changed while the session is open and in the current cycle. Close: managers or the creator, computes the decision.
Delete: developer only.
Each session has a **kind**: `اجتماع` (meeting, everyone votes) or `قرار` (decision, oversight members 10/12/13 can read but not vote; the server answers 403). Existing sessions are meetings (`VoteSessions.Kind`, added by `db:upgrade`).

### 8.4 Cycles (years)
Exactly one current cycle. `POST /api/cycles` (developer) archives the current one (`EndDate = start − 1 day`).
`DELETE /api/cycles/:id` (developer) requires `{confirm: <exact cycle name>}`, deletes its documents, reviews, votes and
Cloudinary files in one transaction, refuses to delete the only cycle, and promotes the latest remaining cycle if the current one was deleted.
Archived cycles are read-only for everyone except the developer (who may add/edit/delete documents there).

### 8.5 Accounts (legacy mode)
- Sign-in by **username or email** (an email only matches when exactly one account uses it). Rate limit 30 / 15 min.
- **Registration is closed** (`/api/auth/register` → 403). The developer creates accounts (`/api/users`) and hands seats to new people by editing the account (changing the username requires a new password).
- Session: HTTP-only cookie `yod_session` (JWT, 1 day, `path=/api`). The JWT carries `ver = sha256(PasswordHash)[0:16]`, so
  **any password change signs out every other session**.
- Self-service (`/api/account`): change own password, email and username, all requiring the current password. Usernames are 3-100 letters/digits/`._-` (no `@`, no spaces: sign-in accepts a username or an email, so a username must never look like someone's email) and unique case-insensitively; documents and votes follow the account, not the name. A wrong current
  password returns **403 (not 401)**, because the client treats 401 as an expired session. Rate limit 20 / 15 min.
- CSRF: non-GET requests need an `Origin` equal to `APP_ORIGIN` or to the request's own host.

- **Temporary passwords (legacy mode).** The developer sets a password when creating or editing a seat, or presses
  "إنشاء كلمة مرور مؤقتة جديدة" (`POST /api/users/:id/reset-password`, shown once). It is stored as `!temporary:scrypt:…`; sign-in works but
  `mustChangePassword` limits the session to `GET /auth/me` and `PUT /account/password` until the member chooses a new password
  (a normal hash lifts the restriction). There is no forgot-password by email; members ask the developer.

### 8.6 Better Auth / Neon mode (`AUTH_PROVIDER=neon`, explicit opt-in; production still runs `legacy` until the switch-over)
Browser talks to Neon Auth for sign-in/sign-up/forgot/reset password; the API verifies the Bearer JWT (JWKS) and maps the
identity to a `Users` row: first by `AuthIdentities`, then by verified email; **an unknown email is rejected (403)**, nothing is auto-created.
Password reset email is sent by Neon (link valid 15 min). Before enabling: add the site to Neon Console → Auth → Domains, confirm email
sending, run `npm run auth:setup`, then every user activates once via "تفعيل حسابي" with the email stored on their account.
Neon sign-in is email-only (no username). Login includes forgot-password requests and reset with password confirmation.
Activation (`/auth/sign-up`) asks only for the email of a managed account provisioned by the developer.
The login page does not offer account creation or an activation link; accounts are provisioned by the developer.
It requests a Better Auth password-reset OTP and opens `/auth/activation-code` immediately after sending.
The code is checked as `forget-password`, then `/auth/new-password` asks for a new password and confirmation.
Saving consumes that same code via `emailOtp.resetPassword`, verifies email ownership and signs in automatically.
The code stays only in component memory; refreshing the password step requires requesting a new code.
Unverified sign-in sends a code and opens the same activation flow. «لدي رمز تأكيد» opens its code step.
`/auth/verify-email` remains available for older email-verification codes; it is not the activation route.
Both the workspace seat and managed identity must exist before activation; a reset request never creates users.
With `AUTH_PROVIDER=neon` the server refuses to start without NEON_AUTH_URL. `legacy` is the default **on purpose**: NEON_AUTH_URL is
already set on Vercel, so a "neon unless told otherwise" default would switch every member on the next deploy. Switch-over steps and rollback: docs/BETTER_AUTH.md.
Activation paths (both end in the same code → new password screens): (1) the developer adds/edits a seat or presses «إرسال دعوات التفعيل»
(`POST /api/users/invite-pending`, 8 seats per press); (2) the member opens «تفعيل حسابي» which calls the public `POST /api/auth/activate`
(`server/services/activation.ts`). Both create the Better Auth login when the seat has none (needs NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID),
link it, replace the seat's stored legacy password with a marker, and mail the code. The public endpoint always answers the same, is rate limited
and has a one-minute per-email cooldown. Placeholder/reserved email domains (example.com, .test, .invalid…) and emails shared by several seats are never
provisioned; in `neon` mode the developer cannot save such an email. Changing a seat's email in `neon` mode = seat handover (old login revoked and deleted).
Provisioned temporary Neon credentials use `Users.PasswordHash = !neon-temporary:<SHA-256 of managed password hash>`.
For these seats the API compares the fingerprint with the credential in `neon_auth.account` (read only).
Until it changes, only authenticated `GET /auth/me` is available; the UI requires a new password via Better Auth,
revoking other sessions. After Neon stores the changed credential, the API removes the temporary marker.
Email verification is still required. No plaintext password or managed password hash is stored by the app.

### 8.7 Search (client side, `src/lib/search.ts` + `src/lib/commands.ts`)
One index over documents and votes of **all** cycles, committees, pages, role-aware actions (add document, new vote, change
password/email, status filters, sign out, developer shortcuts) and, for the developer, users. Arabic folding (alef/ya/ta-marbuta
variants, diacritics, Arabic digits), AND matching, ranking: title prefix > word prefix > substring > other fields. Shortcuts: `/` and Ctrl/⌘+K.

### 8.8 Storage bar (developer)
`GET /api/storage`: Cloudinary `usage()` (storage bytes vs plan limit) and `pg_database_size`. Levels: ok < 75 %, warning ≥ 75 %,
critical ≥ 90 %, full ≥ 100 %. Shown in the top bar and the "المساحة" tab; refreshed every 5 minutes.

## 9. API (all under `/api`; JSON; errors are `{message}` in Arabic)

Public: `GET /health`, `GET /auth/config`, `POST /auth/login`, `POST /auth/register` (403), `POST /auth/logout`.
Authenticated: `GET /auth/me`, `GET /account`, `PUT /account/password`, `PUT /account/email`, `PUT /account/username`, `GET /catalog`,
`GET|POST /documents`, `PUT|DELETE /documents/:id`, `GET /documents/:id/download`, `GET /documents/:id/view` (opened in a new tab; inline for PDF, images and text, any other type is sent as a download; Android phones may still download PDFs because their browsers have no PDF viewer), `POST /reviews`,
`GET|POST /votes`, `POST /votes/:id/vote`, `PUT /votes/:id/close`, `DELETE /votes/:id` (developer), `GET /cycles`.
Developer only (`requireDeveloper`): `POST /cycles`, `DELETE /cycles/:id`, `GET|POST /users`, `PUT /users/:id`, `GET /storage`.
Middleware order in `createApp()`: helmet → json/cookies → Origin check → public routes → `authenticate` → protected routes → 404 → static → `errorHandler`.

## 10. Conventions (follow them)

- **Server imports use `.js` extensions** (native ESM on Vercel). Use `return fail(...)` where TypeScript must narrow after it.
- Permission logic belongs in `server/security.ts` as pure functions with tests; routes call them.
- Add a unit test for every new rule (`server/*.test.ts`, `src/lib/*.test.ts`; `node:test` via `tsx`). Tests use fake `query`/`transaction`, never the real DB.
- Frontend: one component per file, hooks in `src/hooks`, no data fetching in presentational components, Arabic strings inline,
  logical CSS properties (`margin-inline`, …), **no text below 11px**, touch targets ≥ 40px on phones.
- CSS: component styles in the matching file under `src/styles/`; breakpoints only in `responsive.css` (≤1200, ≤850, ≤600, ≥1500).
  Anything `position:absolute` inside a scrolling table must have a positioned scroll box (`.table-scroll{position:relative}`), otherwise it
  stretches the page sideways on phones.
- Comments explain *why* and the rule, in English, as doc comments above functions/components.
- Database changes go in `server/upgrade-schema.ts` as **additive, idempotent, transactional** steps; the previous app version must keep working during the rollout.
- Do **not** commit `.env`, `Yod_System.env`, `.migration-data/`, dumps or credentials. Do **not** add `Co-Authored-By` trailers for AI tools to commits (the owner asked for none).

## 11. Common tasks

- **New role**: insert in `Roles` + `RoleDocPerms` via `upgrade-schema.ts`; add ids to `server/security.ts` and `src/lib/roles.ts`; update demo data, docs, tests.
- **New document type**: `DocumentTypes` row, `RoleDocPerms` rows, label/colour class `file-<id>` in `src/styles`, docs.
- **New endpoint**: zod schema in `schemas.ts`, router in `server/routes/`, mount in `app.ts` (after `authenticate` unless public), test, update §9.
- **New year (production)**: developer console → الأعوام → بدء عام جديد. Nothing is deleted.
- **Hand a seat to a new person**: developer console → المستخدمون → edit (new name, username, email, password).
- **First developer**: `DEV_USERNAME=… DEV_EMAIL=… DEV_FULLNAME=… DEV_PASSWORD=… npm run create-developer` (after `npm run db:upgrade`).

## 12. Known limitations and backlog

- **Vercel body limit ≈ 4.5 MB**: uploads larger than that fail on the hosted site although the API allows 100 MB. Fix: browser → Cloudinary signed uploads.
- Better Auth requires deployment configuration and working Neon email delivery (see docs/BETTER_AUTH.md). Legacy fallback has no password reset mail sender.
- Deleting a single document keeps its Cloudinary file; cycle deletion removes files.
- `/api/cycles` document counts include hidden oversight documents (only the developer sees them).
- "عرض كل النتائج" from search is limited to the year being viewed; search itself covers all years.
- Legacy data contains one email shared by several accounts: email sign-in is refused for those; username still works.
- No audit log, no e-mail/push notifications, in-memory rate limiter (per serverless instance).
- Role ids duplicated between server and client (see §7).

## 13. Documentation set

`docs/YOD-system-guide-ar.pdf` (Arabic guide for people), `docs/YOD-presentation-users-ar.pptx` (for members, no developer role),
`docs/YOD-presentation-full-ar.pptx` (everything incl. developer role). Sources and the regeneration steps are in `docs/README.md`.
Update them when the behaviour they describe changes.

### 8.9 Plain-text legacy passwords (security debt)
Accounts migrated from the original .NET app kept their passwords as **plain text** in `Users.PasswordHash` (12 of 13 in production when
checked). `npm run db:hash-passwords` (dry run) / `-- --apply` replaces them with scrypt hashes without changing any member's password. The
column also holds `!neon-managed:` / `!neon-temporary:` markers (Better Auth seats), which are never touched. Never print stored values.

## Activity log and developer super power

- **Activity log.** `AuditLogs` (created by `npm run db:upgrade`; `services/audit.ts`) records who did what: sign-ins (and failed
  ones, under the attempted name), account changes, user administration, document create/edit/delete/view/download,
  reviews, vote create/cast/close/delete and year start/delete. Routes call `audit(req, { action, summary, details })` **after** the
  action succeeded; a logging failure is swallowed (and printed) so it can never break a request, e.g. before the table exists.
  Entries older than 7 days (`AUDIT_RETENTION_DAYS`) are deleted: hourly per instance on writes, and when the console loads.
  Never log passwords, tokens or what a member voted. The developer reads it at `GET /api/logs` (filters `action` family,
  `userId`, `q`, `before` cursor) and in the admin console tab «سجل النشاط».
- **Developer reviews.** The developer may accept or reject any document in the name of any reviewer role it needs
  (`POST /api/reviews` with `asRoleId`, also for archived years). The review is stored on the seat holding that role so
  `reviewStatus` is unchanged; the log line says «نيابةً عن …» and names the developer as the actor.

## Budgets

- Two budgets per yearly cycle: `union` (خزينة الاتحاد) and `faza` (صندوق فزعة). Tables `BudgetOpening` (opening balance per
  cycle and fund) and `BudgetTransactions` (income/expense with date, category, optional receipt) come from `npm run db:upgrade`.
  Categories live in `server/services/budget.ts` (mirrored in `src/lib/budget.ts`): income اشتراكات/إعلانات/دعم/أخرى, spending
  أنشطة/مواصلات/ضيافة/مطبوعات/أخرى.
- **Who:** the president (1), secretary general (3), financial officer (4), oversight (10/12/13) and the developer can see the
  budgets and receipts (`canViewBudget`). **Only the financial officer (4) adds or deletes entries** (`canManageBudget`); the
  developer is view-only. Receipts are served only through `/api/budget/transactions/:id/view|download` behind the same check.
- Opening balances are typed once, when the developer creates a year (`POST /api/cycles` requires `openingUnion` and
  `openingFaza`; the form shows last year's closing balance as a reminder). There is no endpoint to change them afterwards.
  A year with budget entries cannot be deleted. Entries of finished years are read-only.
- Money is `numeric(14,2)`; sums are rounded with `roundMoney`. Every add/delete/receipt view is written to the activity log.

## Student subscriptions

- Tables `Students` and `SubscriptionPayments` (db:upgrade). A payment has a total amount, a date and 1–4 quarters (`Quarters integer[]`);
  a student cannot pay the same quarter twice in a year (409). Students are matched by name (case and spacing ignored); an unknown
  name creates a new student.
- Each payment also inserts an income line (`اشتراكات`, خزينة الاتحاد) and stores its id in `BudgetTransactionId`. Deleting the
  payment deletes that line in the same transaction; the budget page refuses to delete such a line (409).
- Same visibility and edit rules as the budget (`canViewBudget` / `canManageBudget`: only the financial officer changes anything).
- `GET /api/subscriptions/export[?cycleId=]` returns an `.xlsx` (ExcelJS): sheet «الاشتراكات» (student × quarter) and «الدفعات».

## General Union observer (مراقب من الاتحاد العام)

- Role id 14 (`OBSERVER_ROLE_ID`, created by `db:upgrade`). A read-only visitor: sees documents, votes, calendar, committees and the
  budgets/subscriptions (`canViewBudget`), but `authenticate` refuses every non-GET request except `/account/*` (own password,
  email, username), so nothing can be added or changed whatever route is called. He cannot vote (`canCastVote`), has no
  `RoleDocPerms`, is not a reviewer, and is not listed as a committee (`isCommitteeRole`). The developer creates him like any user.
