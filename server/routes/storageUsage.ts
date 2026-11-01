import { Router } from 'express';
import type { AppContext } from '../http/context.js';
import { requireDeveloper } from '../http/requireDeveloper.js';
import { cloudinaryUsage, databaseUsage } from '../services/storageUsage.js';
import '../services/storage.js'; // configures the Cloudinary client

/** Storage dashboard for the developer: file storage (Cloudinary) and database size (Neon). */
export function storageUsageRoutes({ query }: AppContext) {
  const router = Router();
  router.use(requireDeveloper);

  router.get('/', async (_req, res) => {
    // Each source fails independently so one outage does not hide the other bar.
    const [files, database] = await Promise.allSettled([cloudinaryUsage(), databaseUsage(query)]);
    res.set('Cache-Control', 'no-store').json({
      files: files.status === 'fulfilled' ? files.value : null,
      database: database.status === 'fulfilled' ? database.value : null,
      errors: {
        files: files.status === 'rejected' ? 'تعذر قراءة استخدام مساحة الملفات.' : null,
        database: database.status === 'rejected' ? 'تعذر قراءة حجم قاعدة البيانات.' : null,
      },
    });
  });

  return router;
}
