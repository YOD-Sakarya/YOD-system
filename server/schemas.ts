import { z } from 'zod';

/** Fields shared by creating and editing a document (the file itself arrives as multipart). */
export const documentSchema = z.object({
  title: z.string().trim().min(2).max(250),
  docTypeId: z.coerce.number().int().positive(),
  quarterId: z.coerce.number().int().min(1).max(4),
  eventDate: z.string().refine(value => !Number.isNaN(Date.parse(value))),
});

export const voteSessionSchema = z.object({
  title: z.string().trim().min(3).max(250),
  description: z.string().max(4000),
  kind: z.enum(['اجتماع', 'قرار']).default('اجتماع'),
  closeAt: z.string().datetime({ offset: true }).nullable().optional(),
  // 2-10 distinct, non-empty options.
  options: z
    .array(z.string().trim().min(1).max(200))
    .min(2)
    .max(10)
    .refine(options => new Set(options).size === options.length),
});

export const ballotSchema = z.object({
  optionId: z.number().int().positive(),
  comment: z.string().max(4000).default(''),
});

export const reviewSchema = z.object({
  documentId: z.number().int().positive(),
  decision: z.enum(['مقبول', 'مرفوض']),
  comment: z.string().max(4000),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(10).max(256),
});

export const changeEmailSchema = z.object({
  email: z.email().max(254),
  currentPassword: z.string().min(1).max(256),
});

export const activationSchema = z.object({ email: z.email().max(254) });

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
});
