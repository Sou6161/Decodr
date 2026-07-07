import type {
  Repository,
  RepositoryEntitiesResponse,
  RepositoryProgress,
} from '@arcloom/types';
import path from 'node:path';
import { RepositoryStatus } from '@arcloom/types';
import { storageRoot } from '../config/env.js';
import { removeDir } from '../utils/archive.js';
import { logger } from '../utils/logger.js';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { fileRepository } from '../repositories/fileRepository.js';
import { componentRepository } from '../repositories/componentRepository.js';
import { hookRepository } from '../repositories/hookRepository.js';
import { routeRepository } from '../repositories/routeRepository.js';
import { toRepositoryDto } from '../repositories/repositoryMapper.js';
import {
  toComponentNode,
  toFileNode,
  toHookNode,
  toRouteNode,
} from '../repositories/analysisMapper.js';
import { AppError } from '../utils/AppError.js';

/** Maps each lifecycle status to a coarse progress percentage for the UI. */
const STATUS_PROGRESS: Record<RepositoryStatus, { percent: number; message: string }> = {
  [RepositoryStatus.Pending]: { percent: 5, message: 'Queued' },
  [RepositoryStatus.Extracting]: { percent: 25, message: 'Extracting archive' },
  [RepositoryStatus.Scanning]: { percent: 50, message: 'Scanning files' },
  [RepositoryStatus.Analyzing]: { percent: 80, message: 'Analyzing components' },
  [RepositoryStatus.Ready]: { percent: 100, message: 'Analysis complete' },
  [RepositoryStatus.Failed]: { percent: 100, message: 'Analysis failed' },
};

export const repositoryService = {
  async list(): Promise<Repository[]> {
    const rows = await repositoryRepository.list();
    return rows.map(toRepositoryDto);
  },

  async getById(id: string): Promise<Repository> {
    const row = await repositoryRepository.findById(id);
    if (!row) {
      throw AppError.notFound('Repository not found', 'REPOSITORY_NOT_FOUND');
    }
    return toRepositoryDto(row);
  },

  async getProgress(id: string): Promise<RepositoryProgress> {
    const repo = await this.getById(id);
    const base = STATUS_PROGRESS[repo.status];
    return {
      status: repo.status,
      percent: base.percent,
      message: repo.error ?? base.message,
    };
  },

  /** Deletes a repository (cascades to its entities) and reclaims its storage. */
  async remove(id: string): Promise<void> {
    await this.getById(id); // 404 if missing
    await repositoryRepository.delete(id);
    // Extraction lives at storageRoot/{id}; remove the whole tree.
    await removeDir(path.join(storageRoot, id)).catch((err) =>
      logger.warn(`Failed to remove storage for ${id}`, err),
    );
  },

  /** Returns all extracted entities for a repository (files, components, hooks, routes). */
  async getEntities(id: string): Promise<RepositoryEntitiesResponse> {
    await this.getById(id); // 404 if missing

    const [files, components, hooks, routes] = await Promise.all([
      fileRepository.listByRepository(id),
      componentRepository.listByRepository(id),
      hookRepository.listByRepository(id),
      routeRepository.listByRepository(id),
    ]);

    const pathByFileId = new Map(files.map((f) => [f.id, f.path]));

    return {
      files: files.map(toFileNode),
      components: components.map(toComponentNode),
      hooks: hooks.map((h) => toHookNode(h, pathByFileId.get(h.fileId) ?? '')),
      routes: routes.map(toRouteNode),
    };
  },
};
