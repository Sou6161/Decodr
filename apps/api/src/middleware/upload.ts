import multer, { MulterError } from 'multer';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const ACCEPTED_MIME = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'multipart/x-zip',
]);

/**
 * In-memory upload for a single ZIP file under the configured size limit.
 * The buffer is handed to the extractor; nothing is persisted until a
 * Repository row exists, so failed uploads leave no orphan files.
 */
const uploader = multer({
  storage: multer.memoryStorage(),
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

const single = uploader.single('file');

/**
 * Express middleware accepting one ZIP under the form field "file".
 * Translates Multer's own errors into the standard AppError envelope.
 */
export const uploadZip: RequestHandler = (req, res, next) => {
  single(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          AppError.badRequest(
            `File too large. Maximum upload size is ${env.MAX_UPLOAD_MB} MB.`,
          ),
        );
        return;
      }
      next(AppError.badRequest(`Upload failed: ${err.message}`));
      return;
    }
    next(err);
  });
};
