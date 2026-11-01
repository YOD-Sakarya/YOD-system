import { z } from 'zod';

/** An error that maps directly to an HTTP status and an Arabic message shown to the user. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Throws an HttpError; typed `never` so it can be used inside expressions like `doc || fail(404, ...)`. */
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

/** Parses a positive integer id from a route param or query string. */
export const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
