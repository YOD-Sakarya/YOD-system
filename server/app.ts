import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, legacyCloud, root } from './config.js';
import { query as databaseQuery, transaction as databaseTransaction, documentSql, sessionsSql } from './db.js';
import { type Actor, canReview, canManageVotes, canEditDocument, hashPassword, verifyPassword, reviewStatus, voteDecision } from './security.js';
import { NeonAuthError, verifyNeonToken, resolveNeonActor, type NeonIdentity } from './neon-auth.js';

declare global { namespace Express { interface Request { actor: Actor } } }
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: config.production, path: '/api' };
const docSchema = z.object({ title: z.string().trim().min(2).max(250), docTypeId: z.coerce.number().int().positive(),
  quarterId: z.coerce.number().int().min(1).max(4), eventDate: z.string().refine(v => !Number.isNaN(Date.parse(v))) });
const sessionSchema = z.object({ title: z.string().trim().min(3).max(250), description: z.string().max(4000),
  closeAt: z.string().datetime({ offset: true }).nullable().optional(),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(10).refine(a => new Set(a).size === a.length) });
cloudinary.config(config.cloud);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
async function saveFile(file: Express.Multer.File) {
  if (!file.size) fail(400, 'الملف المرفق فارغ. اختر ملفًا آخر.');
  if (!config.cloud.api_secret) fail(503, 'إعدادات التخزين السحابي غير مكتملة.');
  return new Promise<string>((resolve, reject) => {
    const extension = path.extname(file.originalname);
    const suffix = /^\.[a-zA-Z0-9]{1,10}$/.test(extension) ? extension : '';
    const stream = cloudinary.uploader.upload_stream({ resource_type: 'raw', folder: 'yod_uploads', public_id: randomUUID() + suffix },
      (error, result) => error || !result ? reject(new HttpError(502, 'تعذر رفع الملف. حاول مرة أخرى.')) : resolve(result.secure_url));
    stream.end(file.buffer);
  });
}
export function createApp(dependencies: { query?: typeof databaseQuery; transaction?: typeof databaseTransaction;
  authProvider?: 'legacy' | 'neon'; verifyNeon?: (token: string) => Promise<NeonIdentity> } = {}) {
  const query = dependencies.query || databaseQuery;
  const transaction = dependencies.transaction || databaseTransaction;
  const authProvider = dependencies.authProvider || config.authProvider;
  async function getDocument(docId: number) {
  const [doc] = await query('SELECT * FROM "Documents" WHERE "DocId"=$1', [docId]);
  return doc || fail(404, 'المستند غير موجود.');
}
async function checkType(roleId: number, docTypeId: number) {
  if (!(await query('SELECT 1 FROM "RoleDocPerms" WHERE "RoleId"=$1 AND "DocTypeId"=$2', [roleId, docTypeId])).length)
    fail(403, 'نوع المستند غير متاح لهذا الدور.');
}
  const app = express();
  app.disable('x-powered-by');
  // Vercel terminates TLS in front of the function; trust one proxy hop so client IPs (rate limiting) are correct.
  if (process.env.VERCEL) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.production ? {
    directives: { 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'], 'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'", ...(authProvider === 'neon' && config.neonAuthUrl ? [new URL(config.neonAuthUrl).origin] : [])],
      'upgrade-insecure-requests': null },
  } : false }));
  app.use(express.json({ limit: '1mb' }), cookieParser());
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.origin)
      return next(new HttpError(403, 'مصدر الطلب غير مسموح.'));
    next();
  });
  app.get('/api/health', async (_req, res) => { await query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); });
  app.get('/api/auth/config', (_req, res) => res.set('Cache-Control', 'no-store').json({ provider: authProvider, authUrl: config.neonAuthUrl || null }));
  app.use(['/api/auth/login', '/api/auth/register'], (_req, _res, next) => {
    next(authProvider === 'neon' ? new HttpError(410, 'استخدم خدمة تسجيل الدخول المُدارة للمتابعة.') : undefined);
  });
  const limiter = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.' } });
  app.post('/api/auth/login', limiter, async (req, res) => {
    const body = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(256) }).parse(req.body);
    const [user] = await query(`SELECT u."UserId" AS "userId", u."FullName" AS "fullName", u."RoleId" AS "roleId",
      u."PasswordHash" AS password, r."RoleName" AS "roleName" FROM "Users" u JOIN "Roles" r
      ON r."RoleId"=u."RoleId" WHERE u."Username"=$1 LIMIT 1`, [body.username]);
    if (!user || user.password.startsWith('!neon-managed:') || !verifyPassword(body.password, user.password)) fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    const actor: Actor = { userId: user.userId, fullName: user.fullName, roleId: user.roleId, roleName: user.roleName };
    const token = jwt.sign({ sub: String(actor.userId) }, config.jwtSecret, { expiresIn: '1d', issuer: 'yod-express', audience: 'yod-react' });
    res.cookie('yod_session', token, { ...cookieOptions, maxAge: 86400000 }).json(actor);
  });
  app.post('/api/auth/register', limiter, async (req, res) => {
    const body = z.object({ fullName: z.string().trim().min(3).max(150), username: z.string().trim().min(3).max(100),
      email: z.email(), phoneWhatsapp: z.string().max(30), password: z.string().min(10).max(256) }).parse(req.body);
    await transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`register:${body.username}`]);
      if ((await client.query('SELECT 1 FROM "Users" WHERE "Username"=$1', [body.username])).rowCount) fail(409, 'اسم المستخدم مستخدم بالفعل.');
      // Self-registration never grants a committee or leadership role.
      await client.query(`INSERT INTO "Users" ("RoleId","FullName","Username","Email","PhoneWhatsapp","PasswordHash","CreatedAt")
        VALUES (10,$1,$2,$3,$4,$5,NOW())`, [body.fullName, body.username, body.email, body.phoneWhatsapp, hashPassword(body.password)]);
    });
    res.status(201).json({ message: 'تم إنشاء الحساب بدور مراقب. يمكنك تسجيل الدخول.' });
  });
  app.post('/api/auth/logout', (_req, res) => { res.clearCookie('yod_session', cookieOptions).sendStatus(204); });
  app.use('/api', async (req, _res, next) => {
    try {
      if (authProvider === 'neon') {
        const authorization = req.get('authorization');
        const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
        if (!token) return next(new HttpError(401, 'يرجى تسجيل الدخول.'));
        const identity = await (dependencies.verifyNeon || verifyNeonToken)(token);
        req.actor = await resolveNeonActor(identity, { query, transaction });
        return next();
      }
      const token = req.cookies.yod_session;
      if (!token) return next(new HttpError(401, 'يرجى تسجيل الدخول.'));
      const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: 'yod-express', audience: 'yod-react' });
      if (typeof claims === 'string' || !claims.sub || !/^\d+$/.test(claims.sub)) return next(new HttpError(401, 'الجلسة غير صالحة.'));
      const [actor] = await query(`SELECT u."UserId" AS "userId",u."FullName" AS "fullName",u."RoleId" AS "roleId",
        r."RoleName" AS "roleName" FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId" WHERE u."UserId"=$1`, [Number(claims.sub)]);
      if (!actor) return next(new HttpError(401, 'الحساب غير موجود.'));
      req.actor = actor as Actor; next();
    } catch (error) { next(error instanceof jwt.JsonWebTokenError ? new HttpError(401, 'انتهت الجلسة. سجّل الدخول مجددًا.') : error); }
  });
  app.get('/api/auth/me', (req, res) => res.set('Cache-Control', 'no-store').json(req.actor));
  app.get('/api/catalog', async (_req, res) => {
    const [roles, types, quarters, permissions] = await Promise.all([
      query('SELECT "RoleId" AS "roleId","RoleName" AS "roleName" FROM "Roles" ORDER BY "RoleId"'),
      query('SELECT "DocTypeId" AS "docTypeId","TypeName" AS "typeName" FROM "DocumentTypes" ORDER BY "DocTypeId"'),
      query('SELECT "QuarterID" AS "quarterId","QuarterName" AS "quarterName" FROM "Quarters" ORDER BY "QuarterID"'),
      query('SELECT "RoleId" AS "roleId","DocTypeId" AS "docTypeId" FROM "RoleDocPerms"')]);
    res.json({ roles, types, quarters, permissions });
  });
  app.get('/api/documents', async (req, res) => {
    // Authenticated members retain the existing cross-committee document visibility.
    const roleId = req.query.roleId ? id(req.query.roleId) : null;
    res.json(await query(documentSql + ' WHERE ($1::int IS NULL OR u."RoleId"=$1) ORDER BY d."CreatedAt" DESC', [roleId]));
  });
  app.post('/api/documents', upload.single('file'), async (req, res) => {
    const body = docSchema.parse(req.body);
    await checkType(req.actor.roleId, body.docTypeId);
    if (!req.file) fail(400, 'اختر ملفًا لإرفاقه.');
    const filePath = await saveFile(req.file!);
    const [doc] = await query(`INSERT INTO "Documents" ("OwnerUserId","DocTypeId","Title","EventDate","Status","QuarterId","FilePath","CreatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING "DocId" AS "docId"`,
    [req.actor.userId, body.docTypeId, body.title, body.eventDate, body.docTypeId === 1 ? 'قيد المراجعة' : 'لا يحتاج إلى مراجعة', body.quarterId, filePath]);
    res.status(201).json(doc);
  });
  app.put('/api/documents/:id', upload.single('file'), async (req, res) => {
    const docId = id(req.params.id), doc = await getDocument(docId), body = docSchema.parse(req.body);
    if (!canEditDocument(req.actor, doc.OwnerUserId)) fail(403, 'ليس لديك صلاحية تعديل هذا المستند.');
    const [owner] = await query('SELECT "RoleId" AS "roleId" FROM "Users" WHERE "UserId"=$1', [doc.OwnerUserId]);
    await checkType(owner.roleId, body.docTypeId);
    const filePath = req.file ? await saveFile(req.file) : doc.FilePath;
    await transaction(async client => {
      await client.query('UPDATE "Documents" SET "Title"=$1,"EventDate"=$2,"DocTypeId"=$3,"QuarterId"=$4,"FilePath"=$5,"Status"=$6 WHERE "DocId"=$7',
        [body.title, body.eventDate, body.docTypeId, body.quarterId, filePath, body.docTypeId === 1 ? 'قيد المراجعة' : 'لا يحتاج إلى مراجعة', docId]);
      await client.query('DELETE FROM "Reviews" WHERE "DocId"=$1', [docId]);
    });
    res.json({ docId });
  });
  app.delete('/api/documents/:id', async (req, res) => {
    const docId = id(req.params.id), doc = await getDocument(docId);
    if (!canEditDocument(req.actor, doc.OwnerUserId)) fail(403, 'ليس لديك صلاحية حذف هذا المستند.');
    await query('DELETE FROM "Documents" WHERE "DocId"=$1', [docId]);
    // Retain cloud assets for recovery; database deletion does not destroy a remote file.
    res.sendStatus(204);
  });
  app.get('/api/documents/:id/download', async (req, res) => {
    const doc = await getDocument(id(req.params.id));
    let url: URL;
    try { url = new URL(doc.FilePath); } catch {
      // Support retained local uploads, but never allow a database path to escape wwwroot.
      const webRoot = path.resolve(root, '..', 'Yod_MS3', 'wwwroot');
      const localFile = path.resolve(webRoot, String(doc.FilePath).replace(/^[/\\]+/, ''));
      const relative = path.relative(webRoot, localFile);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(localFile))
        return fail(404, 'الملف المحلي غير موجود على الخادم.');
      res.download(localFile, `${doc.Title}${path.extname(localFile)}`); return;
    }
    const account = [config.cloud, legacyCloud].find(cloud => cloud.cloud_name && url.pathname.startsWith(`/${cloud.cloud_name}/`));
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !account)
      fail(400, 'رابط الملف غير صالح.');
    let upstream = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!upstream.ok && account?.api_secret) {
      const match = url.pathname.match(/^\/[^/]+\/raw\/upload\/(?:v\d+\/)?(.+)$/);
      if (match) {
        await upstream.body?.cancel();
        const signed = cloudinary.url(match[1], { ...account, resource_type: 'raw', secure: true, sign_url: true });
        upstream = await fetch(signed, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      }
    }
    if (!upstream.ok) fail(502, 'تعذر تنزيل الملف من التخزين السحابي.');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    const ext = path.extname(url.pathname).slice(0, 12);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.Title + ext)}`);
    const { Readable } = await import('node:stream');
    if (upstream.body) Readable.fromWeb(upstream.body as never).on('error', () => res.destroy()).pipe(res);
    else res.end();
  });
  app.post('/api/reviews', async (req, res) => {
    if (!canReview(req.actor)) fail(403, 'المراجعة متاحة للرئيس والأمين العام والمسؤول المالي.');
    const body = z.object({ documentId: z.number().int().positive(), decision: z.enum(['مقبول', 'مرفوض']), comment: z.string().max(4000) }).parse(req.body);
    await transaction(async client => {
      const doc = (await client.query('SELECT * FROM "Documents" WHERE "DocId"=$1 FOR UPDATE', [body.documentId])).rows[0];
      if (!doc) fail(404, 'المستند غير موجود.');
      if (doc.DocTypeId !== 1) fail(400, 'المراجعة متاحة لوثائق التصور فقط.');
      await client.query('DELETE FROM "Reviews" WHERE "DocId"=$1 AND "ReviewerUserId"=$2', [body.documentId, req.actor.userId]);
      await client.query('INSERT INTO "Reviews" ("DocId","ReviewerUserId","Decision","Comment","ReviewedAt") VALUES ($1,$2,$3,$4,NOW())',
        [body.documentId, req.actor.userId, body.decision, body.comment]);
      const reviews = (await client.query(`SELECT DISTINCT ON (u."RoleId") u."RoleId" AS role, r."Decision" AS decision
        FROM "Reviews" r JOIN "Users" u ON u."UserId"=r."ReviewerUserId" WHERE r."DocId"=$1 AND u."RoleId" IN (1,3,4)
        ORDER BY u."RoleId",r."ReviewedAt" DESC`, [body.documentId])).rows;
      const status = reviewStatus(reviews);
      await client.query('UPDATE "Documents" SET "Status"=$1 WHERE "DocId"=$2', [status, body.documentId]);
    });
    res.json({ message: 'تم حفظ المراجعة.' });
  });
  app.get('/api/votes', async (req, res) => res.json(await query(sessionsSql + ' ORDER BY s."CreatedAt" DESC', [req.actor.userId])));
  app.post('/api/votes', async (req, res) => {
    if (!canManageVotes(req.actor)) fail(403, 'إنشاء الجلسات متاح للرئيس والأمين العام.');
    const body = sessionSchema.parse(req.body);
    if (body.closeAt && Date.parse(body.closeAt) <= Date.now()) fail(400, 'اختر موعد إغلاق في المستقبل.');
    const sessionId = await transaction(async client => {
      const session = (await client.query(`INSERT INTO "VoteSessions" ("Title","Description","CreatedByUserId","CreatedAt","ClosedAt","Status")
        VALUES ($1,$2,$3,NOW(),$4,'مفتوحة') RETURNING "VoteSessionId" AS id`, [body.title, body.description, req.actor.userId, body.closeAt || null])).rows[0];
      for (const option of body.options) await client.query('INSERT INTO "VoteOptions" ("Text","VoteSessionId") VALUES ($1,$2)', [option, session.id]);
      return session.id;
    });
    res.status(201).json({ sessionId });
  });
  app.post('/api/votes/:id/vote', async (req, res) => {
    const sessionId = id(req.params.id);
    const body = z.object({ optionId: z.number().int().positive(), comment: z.string().max(4000).default('') }).parse(req.body);
    await transaction(async client => {
      const session = (await client.query('SELECT * FROM "VoteSessions" WHERE "VoteSessionId"=$1 FOR UPDATE', [sessionId])).rows[0];
      if (!session) fail(404, 'الجلسة غير موجودة.');
      if (session.Status !== 'مفتوحة' || (session.ClosedAt && new Date(session.ClosedAt).getTime() <= Date.now())) fail(409, 'انتهت جلسة التصويت.');
      if (!(await client.query('SELECT 1 FROM "VoteOptions" WHERE "VoteOptionId"=$1 AND "VoteSessionId"=$2', [body.optionId, sessionId])).rowCount)
        fail(400, 'خيار التصويت غير صالح.');
      await client.query('DELETE FROM "Votes" WHERE "VoteSessionId"=$1 AND "VoterUserId"=$2', [sessionId, req.actor.userId]);
      await client.query('INSERT INTO "Votes" ("VoterUserId","VoteSessionId","VoteOptionId","Comment","VotedAt") VALUES ($1,$2,$3,$4,NOW())',
        [req.actor.userId, sessionId, body.optionId, body.comment]);
    });
    res.json({ message: 'تم حفظ صوتك.' });
  });
  app.put('/api/votes/:id/close', async (req, res) => {
    await transaction(async client => {
      const sessionId = id(req.params.id);
      const session = (await client.query('SELECT * FROM "VoteSessions" WHERE "VoteSessionId"=$1 FOR UPDATE', [sessionId])).rows[0];
      if (!session) fail(404, 'الجلسة غير موجودة.');
      if (!canManageVotes(req.actor) && session.CreatedByUserId !== req.actor.userId) fail(403, 'ليس لديك صلاحية إغلاق الجلسة.');
      if (session.Status !== 'مفتوحة') fail(409, 'الجلسة مغلقة بالفعل.');
      const winners = (await client.query(`SELECT o."Text" AS text,count(v."VoteId")::int AS count FROM "VoteOptions" o
        LEFT JOIN "Votes" v ON v."VoteOptionId"=o."VoteOptionId" WHERE o."VoteSessionId"=$1
        GROUP BY o."VoteOptionId",o."Text" ORDER BY count DESC`, [sessionId])).rows;
      const decision = voteDecision(winners);
      await client.query('UPDATE "VoteSessions" SET "Status"=$1,"ClosedAt"=NOW(),"Decision"=$2 WHERE "VoteSessionId"=$3', ['مغلقة', decision, sessionId]);
    });
    res.json({ message: 'تم إغلاق الجلسة.' });
  });
  app.delete('/api/votes/:id', async (req, res) => {
    await transaction(async client => {
      const sessionId = id(req.params.id);
      const session = (await client.query('SELECT * FROM "VoteSessions" WHERE "VoteSessionId"=$1 FOR UPDATE', [sessionId])).rows[0];
      if (!session) fail(404, 'الجلسة غير موجودة.');
      if (!canManageVotes(req.actor) && session.CreatedByUserId !== req.actor.userId) fail(403, 'ليس لديك صلاحية حذف الجلسة.');
      await client.query('DELETE FROM "Votes" WHERE "VoteSessionId"=$1', [sessionId]);
      await client.query('DELETE FROM "VoteOptions" WHERE "VoteSessionId"=$1', [sessionId]);
      await client.query('DELETE FROM "VoteSessions" WHERE "VoteSessionId"=$1', [sessionId]);
    });
    res.sendStatus(204);
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: 'المسار غير موجود.' }));
  if (config.production && existsSync(path.join(root, 'dist'))) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) { res.destroy(); return; }
    if (error instanceof SyntaxError && 'body' in error) { res.status(400).json({ message: 'صيغة الطلب غير صالحة.' }); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ message: 'تحقق من الحقول المطلوبة وصحة القيم.' }); return; }
    if (error instanceof multer.MulterError) { res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'الحد الأقصى للملف ١٠٠ ميجابايت.' : 'تعذر استقبال الملف.' }); return; }
    if (error instanceof HttpError) { res.status(error.status).json({ message: error.message }); return; }
    if (error instanceof NeonAuthError) { res.status(error.status).json({ message: error.message }); return; }
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ message: 'تعذر إكمال الطلب. تحقق من اتصال قاعدة البيانات وحاول مجددًا.' });
  });
  return app;
}
