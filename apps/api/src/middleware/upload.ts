import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import multer, { MulterError } from 'multer';
import type { RequestHandler } from 'express';
import { env, storageRoot } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const ACCEPTED_MIME = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'multipart/x-zip',
]);

// Temp landing area for uploaded archives (under the gitignored storage root).
const UPLOAD_TMP = path.join(storageRoot, '_uploads');
mkdirSync(UPLOAD_TMP, { recursive: true });

/**
 * Streams a single ZIP upload straight to disk rather than buffering it in
 * memory — large archives (hundreds of MB) never sit in RAM. The processor
 * extracts from the temp path and deletes it afterwards.
 */
const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_TMP),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.zip`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const isZipName = file.originalname.toLowerCase().endsWith('.zip');
    if (!isZipName || !ACCEPTED_MIME.has(file.mimetype)) {
      cb(AppError.badRequest('Only .zip files are supported.'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Files accepted for direct folder uploads: source extensions plus the small set
 * of manifests that answer "what does this project use?".
 *
 * This must stay in sync with the client-side filter in `collectFiles.ts` — the
 * client sends one manifest entry per file, so anything rejected here makes the
 * counts disagree and the whole upload fails.
 */
const SOURCE_FILE = /\.(tsx?|jsx?|mjs|cjs)$/i;
const MANIFEST_FILE = /(^|\/)(package\.json|\.env\.example|\.env\.sample)$/i;
const accepted = (name: string): boolean =>
  SOURCE_FILE.test(name) || MANIFEST_FILE.test(name);

/**
 * Multiple source files streamed to disk for a direct folder upload. The client
 * has already filtered out node_modules/builds/etc., so only source files (each
 * small) arrive; a per-file cap and count cap bound the request.
 */
const folderUploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_TMP),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.src`),
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 12_000, fields: 10 },
  fileFilter: (_req, file, cb) => cb(null, accepted(file.originalname)),
});

const single = uploader.single('file');
const many = folderUploader.array('files', 12_000);

function translateMulterError(err: unknown): AppError | unknown {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return AppError.badRequest(`File too large. Maximum upload size is ${env.MAX_UPLOAD_MB} MB.`);
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return AppError.badRequest('Too many files. Try uploading a smaller folder or a ZIP.');
    }
    return AppError.badRequest(`Upload failed: ${err.message}`);
  }
  return err;
}

/**
 * Express middleware accepting one ZIP under the form field "file".
 * Translates Multer's own errors into the standard AppError envelope.
 */
export const uploadZip: RequestHandler = (req, res, next) => {
  single(req, res, (err: unknown) => next(err ? translateMulterError(err) : undefined));
};

/** Express middleware accepting many source files under the form field "files". */
export const uploadFolder: RequestHandler = (req, res, next) => {
  many(req, res, (err: unknown) => next(err ? translateMulterError(err) : undefined));
};
