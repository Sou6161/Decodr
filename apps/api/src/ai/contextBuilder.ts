import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ExplanationContext } from '@arcloom/types';
import { RepositoryStatus } from '@arcloom/types';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { componentRepository } from '../repositories/componentRepository.js';
import type { ComponentWithPath } from '../repositories/componentRepository.js';
import { edgeRepository } from '../repositories/edgeRepository.js';
import { routeRepository } from '../repositories/routeRepository.js';
import { AppError } from '../utils/AppError.js';

/** Never send the whole repo — cap files and per-file size. */
const MAX_FILES = 8;
const MAX_FILE_CHARS = 6000;

const ROUTING_INTENT = /\b(rout(?:e|es|er|ing)|navigat\w*|url|pathname)\b/i;

/**
 * Builds a *focused* context for an explanation. It locates the component or
 * feature the question is about, pulls in its directly-related files (its own
 * file plus graph neighbors), and truncates everything to a token budget. The
 * whole repository is never included.
 */
export async function buildExplanationContext(
  repositoryId: string,
  question: string,
): Promise<ExplanationContext> {
  const repo = await repositoryRepository.findById(repositoryId);
  if (!repo) {
    throw AppError.notFound('Repository not found', 'REPOSITORY_NOT_FOUND');
  }
  if (repo.status !== RepositoryStatus.Ready) {
    throw AppError.badRequest('Repository is still processing. Try again once it is ready.');
  }

  const [components, edges, routes] = await Promise.all([
    componentRepository.listByRepository(repositoryId),
    edgeRepository.listByRepository(repositoryId),
    routeRepository.listByRepository(repositoryId),
  ]);

  const focus = matchFocusComponent(question, components);

  let focusName: string | null = null;
  let relatedComponents: string[] = [];
  let orderedPaths: string[] = [];

  if (focus) {
    focusName = focus.name;
    const byId = new Map(components.map((c) => [c.id, c]));
    const outgoing = edges
      .filter((e) => e.sourceId === focus.id)
      .map((e) => byId.get(e.targetId))
      .filter((c): c is ComponentWithPath => Boolean(c));
    const incoming = edges
      .filter((e) => e.targetId === focus.id)
      .map((e) => byId.get(e.sourceId))
      .filter((c): c is ComponentWithPath => Boolean(c));

    relatedComponents = unique([...outgoing, ...incoming].map((c) => c.name)).filter(
      (n) => n !== focus.name,
    );
    // Focus file first, then what it renders, then who renders it.
    orderedPaths = unique([
      focus.file.path,
      ...outgoing.map((c) => c.file.path),
      ...incoming.map((c) => c.file.path),
    ]);
  } else if (ROUTING_INTENT.test(question)) {
    focusName = 'Routing';
    const routeFiles = unique(routes.map((r) => r.filePath));
    const targetNames = new Set(
      routes.map((r) => r.componentName).filter((n): n is string => Boolean(n)),
    );
    const targetFiles = components
      .filter((c) => targetNames.has(c.name))
      .map((c) => c.file.path);
    relatedComponents = [...targetNames];
    orderedPaths = unique([...routeFiles, ...targetFiles]);
  } else {
    // General architecture question — lead with the most-imported hub components.
    const hubs = [...components]
      .sort((a, b) => b.importedByCount - a.importedByCount)
      .slice(0, MAX_FILES);
    relatedComponents = hubs.slice(0, 5).map((c) => c.name);
    orderedPaths = unique([
      ...hubs.map((c) => c.file.path),
      ...routes.map((r) => r.filePath),
    ]);
  }

  const files = await readFiles(repo.storagePath, orderedPaths.slice(0, MAX_FILES));

  return { focusName, files, relatedComponents };
}

/**
 * Finds the component a question is about. Prefers whole-word name matches,
 * breaking ties by graph centrality (in-degree) then name length/specificity.
 */
function matchFocusComponent(
  question: string,
  components: ComponentWithPath[],
): ComponentWithPath | null {
  const matches = components.filter((c) =>
    new RegExp(`\\b${escapeRegExp(c.name)}\\b`, 'i').test(question),
  );
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) => b.importedByCount - a.importedByCount || b.name.length - a.name.length,
  )[0]!;
}

async function readFiles(
  projectRoot: string,
  relativePaths: string[],
): Promise<ExplanationContext['files']> {
  const results = await Promise.all(
    relativePaths.map(async (relativePath) => {
      try {
        const content = await readFile(path.join(projectRoot, relativePath), 'utf8');
        const truncated = content.length > MAX_FILE_CHARS;
        return {
          path: relativePath,
          content: truncated ? content.slice(0, MAX_FILE_CHARS) : content,
          truncated,
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((f): f is NonNullable<typeof f> => f !== null);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
