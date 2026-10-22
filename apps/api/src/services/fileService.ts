import type { FileContentResponse } from '@decodr/types';
import { fileRepository } from '../repositories/fileRepository.js';
import { AppError } from '../utils/AppError.js';

/**
 * Serves stored source to the reader.
 *
 * Answers cite files and line numbers, and until now those citations were text:
 * there was nothing to click and no way to check the answer without going back
 * to your editor. The source is already in Postgres — the upload's disk copy is
 * ephemeral on Render — so serving it is just a lookup.
 */

/** Matches the cap the processor applies when storing source. */
const STORED_CONTENT_LIMIT = 64_000;

export const fileService = {
  /** Every path in the repository, for mention autocomplete and the file list. */
  async listPaths(repositoryId: string): Promise<{ path: string; lineCount: number }[]> {
    return fileRepository.listPaths(repositoryId);
  },

  async getContent(repositoryId: string, path: string): Promise<FileContentResponse> {
    const trimmed = path.trim();
    if (!trimmed) throw AppError.badRequest('A file path is required.');

    const file = await fileRepository.findByPath(repositoryId, trimmed);
    if (!file) throw AppError.notFound('File not found in this project', 'FILE_NOT_FOUND');
    // Rows scanned before source was stored have no content. There is no disk
    // copy to fall back to on a host with an ephemeral filesystem, so say so
    // plainly rather than returning an empty file that looks like a bug.
    if (file.content === null) {
      throw AppError.notFound(
        'This file was scanned before source was stored. Re-upload the project to read it.',
        'FILE_CONTENT_UNAVAILABLE',
      );
    }

    return {
      path: file.path,
      content: file.content,
      lineCount: file.lineCount,
      truncated: file.content.length >= STORED_CONTENT_LIMIT,
    };
  },
};
