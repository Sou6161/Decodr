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
/**
 * Per-file truncation for a file the model opens itself.
 *
 * Deliberately larger than retrieval's per-file cap: retrieval attaches a dozen
 * files on a guess, while a file opened by name is one the model decided it
 * needed, and clipping that is how an answer ends up describing the top of a
 * file and inventing the rest.
 */
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

  // Claim the paths NOW, before the first await.
  //
  // A round's tool calls run concurrently, and marking files as read only after
  // fetching them left a window where two calls asking for the same file both
  // saw it as unread: the source went into the prompt twice, the budget was
  // charged twice, and the reader was told two files had been opened. Reserving
  // synchronously closes the window, since nothing else can run in between.
  for (const path of wanted) alreadyRead.add(path);

  const rows = await fileRepository.findByPaths(repositoryId, wanted);
  const found = new Map(rows.map((r) => [r.path, r.content]));

  const blocks: string[] = [];
  const paths: string[] = [];
  let used = 0;

  for (const path of wanted) {
    const content = found.get(path);
    if (content == null) {
      // Release the claim: nothing was shown, so a later call naming the right
      // path must not be told it was "already provided above".
      alreadyRead.delete(path);
      blocks.push(`FILE: ${path}\n(not found in this project)`);
      continue;
    }
    if (used >= budgetChars) {
      alreadyRead.delete(path);
      blocks.push(`FILE: ${path}\n(skipped — context budget reached)`);
      continue;
    }
    const cap = Math.min(MAX_CHARS_PER_FILE, budgetChars - used);
    const body = content.length > cap ? `${content.slice(0, cap)}\n… (truncated)` : content;
    blocks.push(`FILE: ${path}\n${body}`);
    paths.push(path);
    used += body.length;
  }

  return { text: blocks.join('\n\n'), paths };
}
