import type { RequestHandler } from 'express';
import { isDeveloper } from '../security.js';
import { HttpError } from './errors.js';

/** Guards developer-only routers (users, cycles administration, storage). Mount after authentication. */
export const requireDeveloper: RequestHandler = (req, _res, next) => {
  next(isDeveloper(req.actor) ? undefined : new HttpError(403, 'هذه الميزة متاحة للمطوّر فقط.'));
};
