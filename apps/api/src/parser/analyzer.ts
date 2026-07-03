import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { PARSEABLE_EXTENSIONS } from '../utils/sourceFiles.js';
import { parseFile } from './fileParser.js';
import type { ParsedFile } from './types.js';

export interface AnalysisResult {
  files: ParsedFile[];
}

/**
 * Analyzes every parseable file in a scanned repository.
 *
 * @param projectRoot   Absolute path to the detected project root.
 * @param relativePaths Repo-relative paths of all scanned source files.
 */
export async function analyzeRepository(
  projectRoot: string,
  relativePaths: string[],
): Promise<AnalysisResult> {
  // Import resolution is matched against the full scanned file set.
  const knownFiles = new Set(relativePaths);

  const parseable = relativePaths.filter((p) =>
    PARSEABLE_EXTENSIONS.has(path.extname(p).toLowerCase()),
  );

  const files = await Promise.all(
    parseable.map(async (relativePath) => {
      const absolute = path.join(projectRoot, relativePath);
      const content = await readFile(absolute, 'utf8');
      return parseFile(relativePath, content, knownFiles);
    }),
  );

  return { files };
}
