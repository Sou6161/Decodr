import type { Repository } from '@arcloom/types';
import { RepositoryStatus } from '@arcloom/types';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { toRepositoryDto } from '../repositories/repositoryMapper.js';
import { AppError } from '../utils/AppError.js';
import { processRepository } from './repositoryProcessor.js';

/** Turns "My-App.v2.zip" into a clean display name. */
function deriveName(originalName: string): string {
  const base = originalName.replace(/\.zip$/i, '').trim();
  const cleaned = base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'Untitled repository';
}

export const uploadService = {
  /**
   * Persists a repository for an uploaded ZIP and kicks off processing in the
   * background. Returns immediately so the client can poll for progress.
   */
  async uploadAndProcess(file: Express.Multer.File): Promise<Repository> {
    if (!file?.buffer?.length) {
      throw AppError.badRequest('No file was uploaded under field "file".');
    }

    const repo = await repositoryRepository.create({
      name: deriveName(file.originalname),
      status: RepositoryStatus.Pending,
      // Replaced with the detected project root once scanning completes.
      storagePath: 'pending',
    });

    // Detached: the processor records failures as FAILED status itself.
    void processRepository(repo.id, file.buffer);

    return toRepositoryDto(repo);
  },
};
