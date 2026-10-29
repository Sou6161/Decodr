import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { PARSEABLE_EXTENSIONS } from '../utils/sourceFiles.js';
import { parseFile } from './fileParser.js';
import { CONFIG_FILE_RE, readAliasConfigs } from './moduleResolver.js';
import type { ParsedFile } from './types.js';

export interface AnalysisResult {
  files: ParsedFile[];
}

/**
 * Analyzes every parseable file in a scanned repository.
 *
 * @param projectRoot   Absolute path to the detected project root.
 * @param relativePaths Repo-relative paths of all scanned source files.
 * @param contents      Source already read by the scanner, keyed by path. The
 *                      scanner reads every file to count its lines; reading
 *                      them all again here doubled the I/O for nothing. The
 *                      disk is only read for a path missing from this map.
 */
export async function analyzeRepository(
  projectRoot: string,
  relativePaths: string[],
  contents: ReadonlyMap<string, string> = new Map(),
): Promise<AnalysisResult> {
  // Import resolution is matched against the full scanned file set.
  const knownFiles = new Set(relativePaths);

  const read = async (relativePath: string): Promise<string> =>
    contents.get(relativePath) ?? readFile(path.join(projectRoot, relativePath), 'utf8');

  // tsconfig/jsconfig `paths` and `baseUrl`, so `@/components/X` resolves.
  const configPaths = relativePaths.filter((p) => CONFIG_FILE_RE.test(p));
  const configTexts = new Map<string, string>();
  await Promise.all(
    configPaths.map(async (p) => {
      configTexts.set(p, await read(p).catch(() => ''));
    }),
  );
  const aliases = readAliasConfigs(configTexts);

  const parseable = relativePaths.filter((p) =>
    PARSEABLE_EXTENSIONS.has(path.extname(p).toLowerCase()),
  );

  const files = await Promise.all(
    parseable.map(async (relativePath) =>
      parseFile(relativePath, await read(relativePath), knownFiles, aliases),
    ),
  );

  return { files };
}
