import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { NeonAuthError } from '../neon-auth.js';
import { HttpError } from './errors.js';

/** Last middleware: converts known errors into JSON messages and hides the details of unexpected ones. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  // A response already started streaming; the only safe thing left is to drop the connection.
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ message: 'صيغة الطلب غير صالحة.' });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: 'تحقق من الحقول المطلوبة وصحة القيم.' });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      message: error.code === 'LIMIT_FILE_SIZE' ? 'الحد الأقصى للملف ١٠٠ ميجابايت.' : 'تعذر استقبال الملف.',
    });
    return;
  }
  if (error instanceof HttpError || error instanceof NeonAuthError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  // Log only the error class so request data and secrets never reach the logs.
  console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({ message: 'تعذر إكمال الطلب. تحقق من اتصال قاعدة البيانات وحاول مجددًا.' });
}
