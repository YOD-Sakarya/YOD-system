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

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(3).max(150),
  username: z.string().trim().min(3).max(100),
  email: z.email(),
  phoneWhatsapp: z.string().max(30),
  password: z.string().min(10).max(256),
});
