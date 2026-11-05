import { Router } from 'express';
import type { PoolClient } from 'pg';
import { sessionsSql } from '../db.js';
import type { AppContext } from '../http/context.js';
import { fail, id } from '../http/errors.js';
import { ballotSchema, voteSessionSchema } from '../schemas.js';
import { type Actor, canCastVote, canDelete, canManageVotes, voteDecision } from '../security.js';
import { ARCHIVED_MESSAGE, getCurrentCycleId } from '../services/cycles.js';

const STATUS_OPEN = 'مفتوحة';
const STATUS_CLOSED = 'مغلقة';

/** Loads and row-locks a session so concurrent votes, closes and deletes are applied one at a time. */
async function lockSession(client: PoolClient, sessionId: number) {
  const session = (await client.query('SELECT * FROM "VoteSessions" WHERE "VoteSessionId"=$1 FOR UPDATE', [sessionId]))
    .rows[0];
  return session || fail(404, 'الجلسة غير موجودة.');
}

/** Leadership or the session's creator may close or delete it. */
const canManageSession = (actor: Actor, session: { CreatedByUserId: number }) =>
  canManageVotes(actor) || session.CreatedByUserId === actor.userId;

/** Vote sessions: create, vote (one changeable vote per member), close with a decision, delete. */
export function voteRoutes({ query, transaction, audit }: AppContext) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await query(sessionsSql + ' ORDER BY s."CreatedAt" DESC', [req.actor.userId]));
  });

  router.post('/', async (req, res) => {
    if (!canManageVotes(req.actor)) fail(403, 'إنشاء الجلسات متاح للرئيس والأمين العام.');
    const body = voteSessionSchema.parse(req.body);
    if (body.closeAt && Date.parse(body.closeAt) <= Date.now()) fail(400, 'اختر موعد إغلاق في المستقبل.');
    // New sessions belong to the current cycle.
    const cycleId = await getCurrentCycleId(query);
    const sessionId = await transaction(async client => {
      const session = (
        await client.query(
          `INSERT INTO "VoteSessions" ("Title","Description","Kind","CreatedByUserId","CreatedAt","ClosedAt","Status","CycleId")
            VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7) RETURNING "VoteSessionId" AS id`,
          [body.title, body.description, body.kind, req.actor.userId, body.closeAt || null, STATUS_OPEN, cycleId],
        )
      ).rows[0];
      for (const option of body.options)
        await client.query('INSERT INTO "VoteOptions" ("Text","VoteSessionId") VALUES ($1,$2)', [option, session.id]);
      return session.id;
    });
    await audit(req, {
      action: 'vote.create',
      targetType: 'vote_session',
      targetId: sessionId,
      summary: `أنشأ جلسة التصويت «${body.title}»`,
      details: { kind: body.kind, options: body.options.length },
    });
    res.status(201).json({ sessionId });
  });

  router.post('/:id/vote', async (req, res) => {
    const sessionId = id(req.params.id);
    const body = ballotSchema.parse(req.body);
    const votedTitle = await transaction(async client => {
      const session = await lockSession(client, sessionId);
      if (!canCastVote(req.actor, session.Kind))
        fail(403, 'لجنة الرقابة تطّلع على التصويت على القرارات ولا تصوّت فيه.');
      const expired = session.ClosedAt && new Date(session.ClosedAt).getTime() <= Date.now();
      if (session.Status !== STATUS_OPEN || expired) fail(409, 'انتهت جلسة التصويت.');
      // Sessions of finished cycles no longer accept votes.
      const current = (await client.query('SELECT "CycleId" FROM "Cycles" WHERE "IsCurrent"')).rows[0];
      if (!current || session.CycleId !== current.CycleId) fail(409, ARCHIVED_MESSAGE);
      const option = await client.query('SELECT 1 FROM "VoteOptions" WHERE "VoteOptionId"=$1 AND "VoteSessionId"=$2', [
        body.optionId,
        sessionId,
      ]);
      if (!option.rowCount) fail(400, 'خيار التصويت غير صالح.');
      // Replace the member's previous vote so changing one's mind never double counts.
      await client.query('DELETE FROM "Votes" WHERE "VoteSessionId"=$1 AND "VoterUserId"=$2', [
        sessionId,
        req.actor.userId,
      ]);
      await client.query(
        'INSERT INTO "Votes" ("VoterUserId","VoteSessionId","VoteOptionId","Comment","VotedAt") VALUES ($1,$2,$3,$4,NOW())',
        [req.actor.userId, sessionId, body.optionId, body.comment],
      );
      return session.Title as string;
    });
    // Who voted is logged, not what they chose.
    await audit(req, {
      action: 'vote.cast',
      targetType: 'vote_session',
      targetId: sessionId,
      summary: `صوّت في «${votedTitle}»`,
    });
    res.json({ message: 'تم حفظ صوتك.' });
  });

  router.put('/:id/close', async (req, res) => {
    const sessionId = id(req.params.id);
    const closed = await transaction(async client => {
      const session = await lockSession(client, sessionId);
      if (!canManageSession(req.actor, session)) fail(403, 'ليس لديك صلاحية إغلاق الجلسة.');
      if (session.Status !== STATUS_OPEN) fail(409, 'الجلسة مغلقة بالفعل.');
      const tally = (
        await client.query(
          `SELECT o."Text" AS text,count(v."VoteId")::int AS count FROM "VoteOptions" o
            LEFT JOIN "Votes" v ON v."VoteOptionId"=o."VoteOptionId" WHERE o."VoteSessionId"=$1
            GROUP BY o."VoteOptionId",o."Text" ORDER BY count DESC`,
          [sessionId],
        )
      ).rows;
      await client.query(
        'UPDATE "VoteSessions" SET "Status"=$1,"ClosedAt"=NOW(),"Decision"=$2 WHERE "VoteSessionId"=$3',
        [STATUS_CLOSED, voteDecision(tally), sessionId],
      );
      return { title: session.Title as string, decision: voteDecision(tally) };
    });
    await audit(req, {
      action: 'vote.close',
      targetType: 'vote_session',
      targetId: sessionId,
      summary: `أغلق جلسة «${closed.title}» والنتيجة: ${closed.decision}`,
      details: { decision: closed.decision },
    });
    res.json({ message: 'تم إغلاق الجلسة.' });
  });

  router.delete('/:id', async (req, res) => {
    // Checked before touching the database: only the developer deletes sessions.
    if (!canDelete(req.actor)) fail(403, 'حذف الجلسات متاح للمطوّر فقط.');
    const sessionId = id(req.params.id);
    const deletedTitle = await transaction(async client => {
      const session = await lockSession(client, sessionId);
      // Delete children first: votes and options reference the session.
      await client.query('DELETE FROM "Votes" WHERE "VoteSessionId"=$1', [sessionId]);
      await client.query('DELETE FROM "VoteOptions" WHERE "VoteSessionId"=$1', [sessionId]);
      await client.query('DELETE FROM "VoteSessions" WHERE "VoteSessionId"=$1', [sessionId]);
      return session.Title as string;
    });
    await audit(req, {
      action: 'vote.delete',
      targetType: 'vote_session',
      targetId: sessionId,
      summary: `حذف جلسة التصويت «${deletedTitle}»`,
    });
    res.sendStatus(204);
  });

  return router;
}
