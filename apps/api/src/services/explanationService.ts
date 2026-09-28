import type { ExplainResponse } from '@decodr/types';
import { getAIProvider } from '../ai/providerFactory.js';
import {
  buildExplanationContext,
  DETAILED_LIMITS,
  QUICK_LIMITS,
} from '../ai/contextBuilder.js';
import {
  buildChatMessages,
  buildMessages,
  type HistoryTurn,
  type RepositoryFacts,
} from '../ai/promptBuilder.js';
import { classifyQuestion, type QuestionIntent } from '../ai/intent.js';
import { READ_FILES_TOOL, runReadFiles } from '../ai/fileReader.js';
import type { ChatMessage } from '../ai/types.js';
import { logger } from '../utils/logger.js';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { componentRepository } from '../repositories/componentRepository.js';
import { AppError } from '../utils/AppError.js';

/**
 * Answers an architecture question about a repository. Builds a focused context
 * (only the relevant files), then asks the configured AI provider — the whole
 * repository is never sent to the model.
 *
 * Detailed mode goes all-out: far more context files, less truncation, and a
 * much larger answer budget, so nothing important gets skipped. Quick mode stays
 * lean and fast.
 */
export async function explainRepository(
  repositoryId: string,
  question: string,
  opts: {
    detailed?: boolean;
    history?: HistoryTurn[];
    summary?: string | null;
    /** When present the answer is streamed through these callbacks as it is produced. */
    stream?: ExplainStreamHandlers;
  } = {},
): Promise<ExplainResponse> {
  const trimmed = question.trim();
  if (trimmed.length < 3) {
    throw AppError.badRequest('Ask a question with at least a few characters.');
  }

  const provider = getAIProvider();
  if (!provider.isConfigured()) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'AI explanations are not configured. Set the provider API key to enable them.',
    );
  }

  const detailed = opts.detailed ?? false;
  const limits = detailed ? DETAILED_LIMITS : QUICK_LIMITS;

  const history = opts.history ?? [];
  const intent = classifyQuestion(trimmed);
  opts.stream?.onStart(intent);

  // Greetings and "what can you do" are not code questions. Sending them through
  // keyword retrieval used to match files that merely contained the letters of
  // the greeting and explain one of them at random.
  if (intent === 'smalltalk') {
    const facts = await loadRepositoryFacts(repositoryId);
    const req = {
      messages: buildChatMessages(facts, trimmed, history),
      temperature: 0.6,
      maxTokens: 400,
    };
    const result = opts.stream
      ? await provider.stream(req, { onDelta: opts.stream.onDelta })
      : await provider.complete(req);
    const reply = result.text.trim();
    if (reply.length === 0) {
      throw new AppError(
        502,
        'AI_EMPTY_RESPONSE',
        'The model did not produce a reply. Try again.',
      );
    }
    return {
      answer: reply,
      provider: provider.name,
      model: result.model,
      contextPaths: [],
      openedPaths: [],
    };
  }

  // Retrieval query, not the prompt. A follow-up like "why?" or "show me that"
  // has no keywords of its own, so the recent *questions* in the thread are
  // folded in — that's what keeps the file selection on the same subject.
  // Past answers are excluded: they're long and would swamp the keyword scoring.
  const retrievalQuery = [
    ...history
      .filter((t) => t.role === 'user')
      .slice(-2)
      .map((t) => t.content),
    trimmed,
  ].join(' ');

  const context = await buildExplanationContext(repositoryId, retrievalQuery, limits);
  if (context.files.length === 0) {
    throw AppError.unprocessable(
      "Couldn't find code relevant to that question. Try naming a component, or ask about routing.",
    );
  }

  opts.stream?.onContext(context.files.map((f) => f.path));

  const messages: ChatMessage[] = buildMessages(context, trimmed, {
    detailed,
    history,
    summary: opts.summary ?? null,
    overview: intent === 'overview',
  });

  // Files the model has already been shown — both the ones retrieval chose and
  // any it opens itself, so it is never handed the same source twice.
  const seen = new Set(context.files.map((f) => f.path));
  // Tracked apart from `seen` so the UI can show what the model went and fetched.
  const opened: string[] = [];
  // Headroom for on-demand reads, on top of what retrieval already spent.
  let readBudget = detailed ? 160_000 : 30_000;

  const run = (req: Parameters<typeof provider.complete>[0]) =>
    opts.stream ? provider.stream(req, { onDelta: opts.stream.onDelta }) : provider.complete(req);

  let result = await run({
    messages,
    temperature: 0.4,
    maxTokens: detailed ? 9000 : 1400,
    tools: [READ_FILES_TOOL],
  });

  // Let the model pull in what it decides it needs. Bounded so a confused model
  // cannot loop forever, and so cost per question stays predictable.
  for (let round = 0; round < MAX_TOOL_ROUNDS && result.toolCalls?.length; round += 1) {
    messages.push({
      role: 'assistant',
      content: result.text ?? '',
      toolCalls: result.toolCalls,
    });

    const roundPaths: string[] = [];
    for (const call of result.toolCalls) {
      const read =
        call.name === READ_FILES_TOOL.name
          ? await runReadFiles(repositoryId, call.args, seen, readBudget)
          : { text: `Unknown tool: ${call.name}`, paths: [] };
      opened.push(...read.paths);
      roundPaths.push(...read.paths);
      readBudget -= read.text.length;
      messages.push({ role: 'tool', content: read.text, toolCallId: call.id });
    }

    logger.info(
      `Explain: tool round ${round + 1}, ${seen.size} file(s) in context, ` +
        `${Math.max(readBudget, 0)} chars of read budget left`,
    );

    if (roundPaths.length > 0) opts.stream?.onFiles(roundPaths);
    // Anything streamed before the tool call is not part of the final answer.
    opts.stream?.onReset();

    const canReadMore = round < MAX_TOOL_ROUNDS - 1 && readBudget > 0;
    if (!canReadMore) {
      // Removing the tool silently made the model emit the call as plain text —
      // it still wanted to read, and with no tool available it wrote out
      // "<tool_call>..." into the answer. Tell it the budget is spent instead.
      messages.push({
        role: 'system',
        content:
          'No further file reads are available. Answer the question now using the files you ' +
          'already have. If something is missing, say which file you would need and why — ' +
          'do not write out a tool call.',
      });
    }

    result = await run({
      messages,
      temperature: 0.4,
      maxTokens: detailed ? 9000 : 1400,
      ...(canReadMore ? { tools: [READ_FILES_TOOL] } : {}),
    });
  }

  const answer = stripTextToolCalls(result.text).trim();
  // A model that spends its last round on tool calls, or returns nothing, would
  // otherwise be persisted as a blank message the reader cannot act on.
  if (answer.length === 0) {
    throw new AppError(
      502,
      'AI_EMPTY_RESPONSE',
      'The model did not produce an answer. Try rephrasing the question.',
    );
  }

  return {
    answer,
    provider: provider.name,
    model: result.model,
    contextPaths: [...seen],
    openedPaths: opened,
  };
}

/**
 * Removes tool calls a model wrote as prose.
 *
 * Some models — open-weights ones especially — emit `<tool_call>…</tool_call>`
 * or `<function=…>` into the message body rather than using the structured
 * tool-calling field. That is machine syntax leaking into a human answer, so it
 * is stripped before anything is shown or saved.
 */
export function stripTextToolCalls(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function=[\s\S]*?<\/function>/gi, '')
    .replace(/<\|?(?:tool_call|function_call)\|?>[\s\S]*?<\|?\/(?:tool_call|function_call)\|?>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Callbacks a caller supplies to receive the answer incrementally. */
export interface ExplainStreamHandlers {
  /**
   * Fired once the kind of message is known, before any work that takes time.
   * Lets the reader show what is actually happening — saying "reading the
   * codebase" while answering "hi" is simply untrue.
   */
  onStart: (intent: QuestionIntent) => void;
  /** Fired once retrieval has chosen files — within milliseconds of the ask. */
  onContext: (paths: string[]) => void;
  onDelta: (text: string) => void;
  /** Fired when the model opens files mid-answer, so the UI can say so. */
  onFiles: (paths: string[]) => void;
  /**
   * Discard everything streamed so far. A round that ends in a tool call may
   * have emitted preamble ("let me check that file…") which is not part of the
   * saved answer — only the final round's text is. Without this the reader
   * shows text that disappears when the persisted message replaces it.
   */
  onReset: () => void;
}

/**
 * How many times the model may stop to read more files before it has to answer.
 * Each round is another model call, so this bounds both latency and cost.
 */
const MAX_TOOL_ROUNDS = 3;


/** The small set of project facts a conversational reply is grounded in. */
async function loadRepositoryFacts(repositoryId: string): Promise<RepositoryFacts> {
  const [repo, components] = await Promise.all([
    repositoryRepository.findById(repositoryId),
    componentRepository.listByRepository(repositoryId),
  ]);
  if (!repo) throw AppError.notFound('Repository not found', 'REPOSITORY_NOT_FOUND');

  const topComponents = [...components]
    .sort((a, b) => b.importedByCount - a.importedByCount)
    .slice(0, 5)
    .map((c) => c.name);

  const areas = [
    ...new Set(
      components
        .map((c) => c.file.path.split('/').slice(0, 2).join('/'))
        .filter((a) => a.includes('/')),
    ),
  ].slice(0, 6);

  return {
    name: repo.name,
    fileCount: repo.fileCount,
    componentCount: repo.componentCount,
    hookCount: repo.hookCount,
    routeCount: repo.routeCount,
    topComponents,
    areas,
  };
}
