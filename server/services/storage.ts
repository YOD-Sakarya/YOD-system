import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { config, legacyCloud, root } from '../config.js';
import { fail, HttpError } from '../http/errors.js';

cloudinary.config(config.cloud);

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Keeps the single uploaded file in memory so it can be streamed straight to Cloudinary. */
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

const SIGNED_URL_PATH = /^\/[^/]+\/raw\/upload\/(?:v\d+\/)?(.+)$/;
const FETCH_TIMEOUT_MS = 30000;

/** Uploads a file to Cloudinary under a random name (keeping a safe extension) and returns its URL. */
export async function saveFile(file: Express.Multer.File) {
  if (!file.size) fail(400, 'الملف المرفق فارغ. اختر ملفًا آخر.');
  if (!config.cloud.api_secret) fail(503, 'إعدادات التخزين السحابي غير مكتملة.');
  return new Promise<string>((resolve, reject) => {
    const extension = path.extname(file.originalname);
    const suffix = /^\.[a-zA-Z0-9]{1,10}$/.test(extension) ? extension : '';
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', folder: 'yod_uploads', public_id: randomUUID() + suffix },
      (error, result) =>
        error || !result ? reject(new HttpError(502, 'تعذر رفع الملف. حاول مرة أخرى.')) : resolve(result.secure_url),
    );
    stream.end(file.buffer);
  });
}

/** Sends a pre-cloud upload from the legacy .NET app's wwwroot, refusing paths that escape it. */
function sendLocalFile(res: Response, filePath: string, title: string) {
  const webRoot = path.resolve(root, '..', 'Yod_MS3', 'wwwroot');
  const localFile = path.resolve(webRoot, filePath.replace(/^[/\\]+/, ''));
  const relative = path.relative(webRoot, localFile);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(localFile))
    fail(404, 'الملف المحلي غير موجود على الخادم.');
  res.download(localFile, `${title}${path.extname(localFile)}`);
}

/**
 * Streams a stored document to the client. Handles both retained local files and Cloudinary URLs
 * from either the current or the legacy account; private files are retried with a signed URL.
 */
export async function sendDocument(res: Response, doc: { FilePath: string; Title: string }) {
  let url: URL;
  try {
    url = new URL(doc.FilePath);
  } catch {
    return sendLocalFile(res, String(doc.FilePath), doc.Title);
  }
  // Only fetch Cloudinary URLs that belong to one of our accounts (prevents using the endpoint as an open proxy).
  const account = [config.cloud, legacyCloud].find(
    cloud => cloud.cloud_name && url.pathname.startsWith(`/${cloud.cloud_name}/`),
  );
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !account) fail(400, 'رابط الملف غير صالح.');

  let upstream = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
  if (!upstream.ok && account?.api_secret) {
    const match = url.pathname.match(SIGNED_URL_PATH);
    if (match) {
      await upstream.body?.cancel();
      const signed = cloudinary.url(match[1], { ...account, resource_type: 'raw', secure: true, sign_url: true });
      upstream = await fetch(signed, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
    }
  }
  if (!upstream.ok) fail(502, 'تعذر تنزيل الملف من التخزين السحابي.');

  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  const extension = path.extname(url.pathname).slice(0, 12);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.Title + extension)}`);
  if (upstream.body)
    Readable.fromWeb(upstream.body as never)
      .on('error', () => res.destroy())
      .pipe(res);
  else res.end();
}
