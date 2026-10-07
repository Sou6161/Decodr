import { fileRepository } from '../repositories/fileRepository.js';
import type { ToolSpec } from './types.js';

/**
 * Lets the model open files itself, mid-answer.
 *
 * Retrieval picks files up front from keywords, which is fast but guesses. A
 * whole codebase cannot be sent instead — a mid-size project is 150k–600k
 * tokens, past the model's window and expensive on every message. So the model
 * gets the project map plus this tool, and pulls in whatever it turns out to
 * need. It reads only what it opens, but nothing in the repo is out of reach.
 */

export const READ_FILES_TOOL: ToolSpec = {
  name: 'read_files',
  description:
    'Open files from the project and read their full source. Use this whenever ' +
    'the answer depends on a file you have not been given — the project map ' +
    'lists every path available. Prefer one call with several paths over many calls.',
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Repo-relative paths exactly as they appear in the project map.',
      },
    },
    required: ['paths'],
  },
};

/** Most files one call may open, so a single request cannot blow the budget. */
const MAX_PATHS_PER_CALL = 6;
/** Per-file truncation, matching the context budget's per-file cap. */
const MAX_CHARS_PER_FILE = 22_000;

export interface ReadResult {
  text: string;
  /** Paths actually returned, for the citation list shown in the UI. */
  paths: string[];
}

/**
 * Runs a `read_files` call against the database copy of the source. Reading from
 * the database rather than disk is deliberate: uploads live on an ephemeral
 * filesystem and vanish on redeploy.
 */
export async function runReadFiles(
  repositoryId: string,
  rawArgs: string,
  alreadyRead: Set<string>,
  budgetChars: number,
): Promise<ReadResult> {
  let requested: string[];
  try {
    const parsed = JSON.parse(rawArgs) as { paths?: unknown };
    requested = Array.isArray(parsed.paths) ? parsed.paths.map(String) : [];
  } catch {
    return { text: 'Could not parse the paths argument. Pass {"paths": ["a/b.tsx"]}.', paths: [] };
  }
  if (requested.length === 0) return { text: 'No paths were requested.', paths: [] };

  const wanted = requested.filter((p) => !alreadyRead.has(p)).slice(0, MAX_PATHS_PER_CALL);
  if (wanted.length === 0) {
    return { text: 'Those files were already provided above.', paths: [] };
  }

  const rows = await fileRepository.findByPaths(repositoryId, wanted);
  const found = new Map(rows.map((r) => [r.path, r.content]));

  const blocks: string[] = [];
  const paths: string[] = [];
  let used = 0;

  for (const path of wanted) {
    const content = found.get(path);
    if (content == null) {
      blocks.push(`FILE: ${path}\n(not found in this project)`);
      continue;
    }
    if (used >= budgetChars) {
      blocks.push(`FILE: ${path}\n(skipped — context budget reached)`);
      continue;
    }
    const cap = Math.min(MAX_CHARS_PER_FILE, budgetChars - used);
    const body = content.length > cap ? `${content.slice(0, cap)}\n… (truncated)` : content;
    blocks.push(`FILE: ${path}\n${body}`);
    paths.push(path);
    alreadyRead.add(path);
    used += body.length;
  }

  return { text: blocks.join('\n\n'), paths };
}
