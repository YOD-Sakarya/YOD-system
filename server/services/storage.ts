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

/**
 * File types a browser can display safely. Anything else (Office files, archives, and above all HTML or SVG, which could run
 * scripts on our origin) is only offered as a download.
 */
const VIEWABLE_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};
export const viewableType = (extension: string) => VIEWABLE_TYPES[extension.toLowerCase()];

/** Sends a pre-cloud upload from the legacy .NET app's wwwroot, refusing paths that escape it. */
function sendLocalFile(res: Response, filePath: string, title: string, inline: boolean) {
  const webRoot = path.resolve(root, '..', 'Yod_MS3', 'wwwroot');
  const localFile = path.resolve(webRoot, filePath.replace(/^[/\\]+/, ''));
  const relative = path.relative(webRoot, localFile);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(localFile))
    fail(404, 'الملف المحلي غير موجود على الخادم.');
  const extension = path.extname(localFile);
  const type = viewableType(extension);
  // Types a browser cannot display are downloaded instead, so the view button never ends on an error page.
  if (!inline || !type) return res.download(localFile, `${title}${extension}`);
  res.type(type).setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(title + extension)}`);
  res.sendFile(localFile);
}

/**
 * Streams a stored document to the client. Handles both retained local files and Cloudinary URLs
 * from either the current or the legacy account; private files are retried with a signed URL.
 */
export async function sendDocument(
  res: Response,
  doc: { FilePath: string; Title: string },
  { inline = false }: { inline?: boolean } = {},
) {
  let url: URL;
  try {
    url = new URL(doc.FilePath);
  } catch {
    return sendLocalFile(res, String(doc.FilePath), doc.Title, inline);
  }
  // Only fetch Cloudinary URLs that belong to one of our accounts (prevents using the endpoint as an open proxy).
  const account = [config.cloud, legacyCloud].find(
    cloud => cloud.cloud_name && url.pathname.startsWith(`/${cloud.cloud_name}/`),
  );
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !account) fail(400, 'رابط الملف غير صالح.');

  const extension = path.extname(url.pathname).slice(0, 12);
  // Only types a browser can display safely are shown; anything else is sent as a download.
  const viewable = inline ? viewableType(extension) : undefined;

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

  // For viewing, our own type decides how the browser treats the file, never the type Cloudinary reports.
  res.setHeader('Content-Type', viewable ?? (upstream.headers.get('content-type') || 'application/octet-stream'));
  res.setHeader(
    'Content-Disposition',
    `${viewable ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.Title + extension)}`,
  );
  if (upstream.body)
    Readable.fromWeb(upstream.body as never)
      .on('error', () => res.destroy())
      .pipe(res);
  else res.end();
}

/**
 * Permanently removes uploaded files of this account from Cloudinary (used when a whole year is deleted).
 * Best effort: files that are already gone count as removed, other failures are reported, never thrown.
 */
export async function deleteCloudFiles(urls: string[]) {
  const publicIds: string[] = [];
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(`/${config.cloud.cloud_name}/`)) continue;
      const match = url.pathname.match(SIGNED_URL_PATH);
      if (match) publicIds.push(decodeURIComponent(match[1]));
    } catch {
      // Not a URL (legacy local path): nothing to remove remotely.
    }
  }
  let removed = 0;
  let failed = 0;
  // The admin API deletes up to 100 resources per call.
  for (let i = 0; i < publicIds.length; i += 100) {
    const batch = publicIds.slice(i, i + 100);
    try {
      const result = await cloudinary.api.delete_resources(batch, { resource_type: 'raw', invalidate: true });
      for (const outcome of Object.values(result.deleted ?? {})) {
        if (outcome === 'deleted' || outcome === 'not_found') removed++;
        else failed++;
      }
    } catch {
      failed += batch.length;
    }
  }
  return { removed, failed };
}
