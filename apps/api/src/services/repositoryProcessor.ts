import path from 'node:path';
import { RepositoryStatus } from '@arcloom/types';
import { storageRoot } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { extractZipBuffer, removeDir } from '../utils/archive.js';
import { scanRepository } from '../scanner/fileScanner.js';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { fileRepository } from '../repositories/fileRepository.js';
import { analyzeAndPersist } from './analysisService.js';

/**
 * Runs the analysis pipeline for an uploaded repository:
 *
 *   EXTRACTING → SCANNING → ANALYZING → READY
 *
 * Designed to run detached from the HTTP request (fire-and-forget). All errors
 * are caught and recorded as a FAILED status, so a caller can never leave a
 * repository stuck mid-pipeline. The ANALYZING stage is a no-op placeholder
 * that Phase 3 (the React parser) hooks into.
 */
export async function processRepository(
  repositoryId: string,
  zipBuffer: Buffer,
): Promise<void> {
  const extractDir = path.join(storageRoot, repositoryId);

  try {
    // 1. Extract -------------------------------------------------------------
    await repositoryRepository.update(repositoryId, {
      status: RepositoryStatus.Extracting,
    });
    await extractZipBuffer(zipBuffer, extractDir);

    // 2. Scan ----------------------------------------------------------------
    await repositoryRepository.update(repositoryId, {
      status: RepositoryStatus.Scanning,
    });
    const scan = await scanRepository(extractDir);

    if (scan.files.length === 0) {
      throw AppError.unprocessable(
        'No React/TypeScript source files were found. Upload a React + TypeScript project.',
      );
    }

    await fileRepository.deleteByRepository(repositoryId);
    await fileRepository.createMany(
      scan.files.map((f) => ({
        repositoryId,
        path: f.relativePath,
        sizeBytes: f.sizeBytes,
        lineCount: f.lineCount,
      })),
    );

    // 3. Analyze — parse components/hooks/routes and build the graph ---------
    await repositoryRepository.update(repositoryId, {
      status: RepositoryStatus.Analyzing,
      // The detected project root is where the parser reads source from.
      storagePath: scan.projectRoot,
      fileCount: scan.files.length,
      totalLines: scan.totalLines,
    });

    const persistedFiles = await fileRepository.listByRepository(repositoryId);
    const counts = await analyzeAndPersist(
      repositoryId,
      scan.projectRoot,
      persistedFiles.map((f) => ({ id: f.id, path: f.path })),
    );

    // 4. Ready ---------------------------------------------------------------
    await repositoryRepository.update(repositoryId, {
      status: RepositoryStatus.Ready,
      error: null,
      componentCount: counts.componentCount,
      hookCount: counts.hookCount,
      routeCount: counts.routeCount,
    });

    logger.info(
      `Repository ${repositoryId} analyzed: ${scan.files.length} files, ` +
        `${counts.componentCount} components, ${counts.hookCount} hooks, ` +
        `${counts.routeCount} routes, ${counts.edgeCount} edges`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown processing error';
    logger.error(`Repository ${repositoryId} failed: ${message}`);
    await repositoryRepository
      .update(repositoryId, {
        status: RepositoryStatus.Failed,
        error: message,
      })
      .catch((updateErr) =>
        logger.error('Failed to record FAILED status', updateErr),
      );
    // Reclaim disk for a failed extraction.
    await removeDir(extractDir).catch(() => undefined);
  }
}
