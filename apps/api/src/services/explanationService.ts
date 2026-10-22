import type { ExplainResponse } from '@decodr/types';
import { getAIProvider } from '../ai/providerFactory.js';
import {
  buildExplanationContext,
  CONTEXT_LIMITS,
  MAP_ONLY_LIMITS,
} from '../ai/contextBuilder.js';
import {
  buildChatMessages,
  buildGeneralMessages,
  buildMessages,
  type HistoryTurn,
  type RepositoryFacts,
} from '../ai/promptBuilder.js';
import { classifyQuestion, type QuestionIntent } from '../ai/intent.js';
import { extractMentions, mightReferenceFiles, type Mentions } from '../ai/mentions.js';
import { READ_FILES_TOOL, runReadFiles } from '../ai/fileReader.js';
import {
  FIND_USAGES_TOOL,
  GET_COMPONENT_TOOL,
  SEARCH_CODE_TOOL,
  runFindUsages,
  runGetComponent,
  runSearchCode,
} from '../ai/codeTools.js';
import type { ChatMessage } from '../ai/types.js';
import { logger } from '../utils/logger.js';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { componentRepository } from '../repositories/componentRepository.js';
import { fileRepository } from '../repositories/fileRepository.js';
import { AppError } from '../utils/AppError.js';

/**
 * Answers a message about a repository.
 *
 * Four paths, chosen by what was actually sent. Small talk gets a one-line
 * reply off a handful of project facts. A general programming question is
 * answered from knowledge. Anything about this project's code gets a focused
 * context — only the relevant files, never the whole repository — and the
 * model can open more as it goes. Depth is the model's call, taken from the
 * question itself rather than from a mode the reader had to pick in advance.
 */
export async function explainRepository(
  repositoryId: string,
  question: string,
  opts: {
    history?: HistoryTurn[];
    summary?: string | null;
    /** When present the answer is streamed through these callbacks as it is produced. */
    stream?: ExplainStreamHandlers;
    /** Cancels the in-flight model call when the reader stops the answer. */
    signal?: AbortSignal;
    /** Titles of the reader's other threads on this project, for continuity. */
    relatedThreads?: string[];
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

  const limits = CONTEXT_LIMITS;

  const history = opts.history ?? [];

  // Mentions are resolved before the intent is announced, because naming a file
  // settles what kind of message this is: `@src/App.tsx why does this rerender`
  // is a question about their code however its wording scores.
  const mentions: Mentions = mightReferenceFiles(trimmed)
    ? extractMentions(trimmed, (await fileRepository.listPaths(repositoryId)).map((f) => f.path))
    : { paths: [], isError: false };

  const intent =
    mentions.paths.length > 0 || mentions.isError ? 'code' : classifyQuestion(trimmed);
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
      ...(opts.signal ? { signal: opts.signal } : {}),
    };
    const result = opts.stream
      ? await provider.stream(req, {
          onDelta: opts.stream.onDelta,
          onRestart: opts.stream.onReset,
        })
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
      truncated: false,
    };
  }

  // "What is the difference between useMemo and useCallback", "write me a
  // debounce hook", "how do I structure a form" — programming questions that
  // name nothing in this project. These used to be forced down the retrieval
  // path, which attached whichever files scored highest on the keywords and
  // then answered about them.
  if (intent === 'general') {
    return answerFromKnowledge(repositoryId, provider, trimmed, history, opts);
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

  const context = await buildExplanationContext(
    repositoryId,
    retrievalQuery,
    limits,
    mentions.paths,
  );
  // Retrieval found nothing to attach. That used to be a hard error telling the
  // reader to go and name a component — but a question is not invalid just
  // because keyword matching missed it. Answer it from knowledge instead; the
  // map and the code tools go along, so if it really is about their code the
  // model can still find it.
  if (context.files.length === 0) {
    logger.info('Explain: retrieval matched nothing; answering from knowledge');
    return answerFromKnowledge(repositoryId, provider, trimmed, history, opts, context.repoMap);
  }

  opts.stream?.onContext(context.files.map((f) => f.path));

  const messages: ChatMessage[] = buildMessages(context, trimmed, {
    history,
    summary: opts.summary ?? null,
    mentionedPaths: mentions.paths,
    isError: mentions.isError,
    relatedThreads: opts.relatedThreads ?? [],
  });

  // Files the model has already been shown — both the ones retrieval chose and
  // any it opens itself, so it is never handed the same source twice.
  const seen = new Set(context.files.map((f) => f.path));
  // Tracked apart from `seen` so the UI can show what the model went and fetched.
  const opened: string[] = [];
  // Headroom for on-demand reads, on top of what retrieval already spent.
  let readBudget = READ_BUDGET_CHARS;

  return runAnswerLoop({
    repositoryId,
    provider,
    messages,
    seen,
    opened,
    readBudget,
    ...(opts.stream ? { stream: opts.stream } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
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

/** Everything the model may call while answering. */
const TOOLS = [READ_FILES_TOOL, SEARCH_CODE_TOOL, FIND_USAGES_TOOL, GET_COMPONENT_TOOL];

/**
 * Dispatches one tool call.
 *
 * Only `read_files` returns paths worth citing — the others answer questions
 * about the project rather than handing over source, so they do not count
 * towards the files shown to the reader.
 */
async function runTool(
  repositoryId: string,
  name: string,
  args: string,
  seen: Set<string>,
  budget: number,
): Promise<{ text: string; paths: string[] }> {
  switch (name) {
    case READ_FILES_TOOL.name:
      return runReadFiles(repositoryId, args, seen, budget);
    case SEARCH_CODE_TOOL.name:
      return { text: await runSearchCode(repositoryId, args), paths: [] };
    case FIND_USAGES_TOOL.name:
      return { text: await runFindUsages(repositoryId, args), paths: [] };
    case GET_COMPONENT_TOOL.name:
      return { text: await runGetComponent(repositoryId, args), paths: [] };
    default:
      return { text: `Unknown tool: ${name}`, paths: [] };
  }
}

/**
 * Room for the longest answer a question can reasonably need. The model decides
 * how much of it to use — a one-line question gets a one-line answer — and the
 * continuation loop covers the rare case where even this runs out.
 */
const ANSWER_TOKENS = 4000;

/** Headroom for files the model opens itself, on top of what retrieval sent. */
const READ_BUDGET_CHARS = 90_000;

/**
 * How many times an answer may be resumed after hitting the token limit.
 *
 * Two is enough for a long walkthrough to finish while keeping the worst case
 * bounded: a runaway answer cannot spend the budget indefinitely.
 */
const MAX_CONTINUATIONS = 2;

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

/**
 * Answers without a retrieved file set: from the model's own knowledge, with
 * the project map and the code tools available so it can ground the answer or
 * go and look if the question turns out to be about their code.
 */
async function answerFromKnowledge(
  repositoryId: string,
  provider: Provider,
  question: string,
  history: HistoryTurn[],
  opts: { summary?: string | null; stream?: ExplainStreamHandlers; signal?: AbortSignal },
  repoMap?: string,
): Promise<ExplainResponse> {
  const [facts, map] = await Promise.all([
    loadRepositoryFacts(repositoryId),
    // Reuse the caller's map when it already built one, rather than paying for
    // the same queries twice on the retrieval-missed path.
    repoMap !== undefined
      ? Promise.resolve(repoMap)
      : buildExplanationContext(repositoryId, question, MAP_ONLY_LIMITS).then((c) => c.repoMap),
  ]);

  // Nothing is attached yet, so there are no files to report — but the reader
  // still gets told the moment the model opens one.
  opts.stream?.onContext([]);

  const messages = buildGeneralMessages(facts, map, question, {
    history,
    summary: opts.summary ?? null,
  });

  return runAnswerLoop({
    repositoryId,
    provider,
    messages,
    seen: new Set<string>(),
    opened: [],
    readBudget: READ_BUDGET_CHARS,
    ...(opts.stream ? { stream: opts.stream } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
}

/** The configured provider, whichever one the factory hands back. */
type Provider = ReturnType<typeof getAIProvider>;

/**
 * Runs a prepared conversation to a finished answer.
 *
 * Shared by every path that can end up needing the codebase: the model may stop
 * to read files, and may have to be resumed if it hits the token ceiling
 * mid-sentence. Both the retrieval path and the general-knowledge path go
 * through here, so a general question that turns out to be about this project
 * can still go and look rather than guessing.
 */
async function runAnswerLoop(args: {
  repositoryId: string;
  provider: Provider;
  messages: ChatMessage[];
  /** Files already in the prompt, so the model is never handed the same source twice. */
  seen: Set<string>;
  /** Files the model opened itself, reported to the reader. */
  opened: string[];
  readBudget: number;
  stream?: ExplainStreamHandlers;
  signal?: AbortSignal;
}): Promise<ExplainResponse> {
  const { repositoryId, provider, messages, seen, opened } = args;
  let readBudget = args.readBudget;
  const opts = { stream: args.stream, signal: args.signal };

  const run = (req: Parameters<Provider['complete']>[0]) => {
    const withSignal = opts.signal ? { ...req, signal: opts.signal } : req;
    return opts.stream
      ? provider.stream(withSignal, {
          onDelta: opts.stream.onDelta,
          // A model swap mid-answer discards what was shown, same as a tool round.
          onRestart: opts.stream.onReset,
        })
      : provider.complete(withSignal);
  };

  let result = await run({
    messages,
    temperature: 0.4,
    maxTokens: ANSWER_TOKENS,
    tools: TOOLS,
  });

  // Let the model pull in what it decides it needs. Bounded so a confused model
  // cannot loop forever, and so cost per question stays predictable.
  for (let round = 0; round < MAX_TOOL_ROUNDS && result.toolCalls?.length; round += 1) {
    messages.push({
      role: 'assistant',
      content: result.text ?? '',
      toolCalls: result.toolCalls,
    });

    // One round often asks for several things at once — three file reads plus a
    // search. Awaiting them in sequence made each round as slow as the sum of
    // its parts for no reason: they are independent lookups against Postgres.
    //
    // The budget is split evenly rather than consumed in order, because
    // "whatever is left" is not knowable until the others have finished. The
    // cost is that one large file can be clipped while a sibling call leaves
    // room unused; the saving is a round that takes as long as its slowest part.
    const share = Math.floor(readBudget / result.toolCalls.length);
    const reads = await Promise.all(
      result.toolCalls.map((call) => runTool(repositoryId, call.name, call.args, seen, share)),
    );

    const roundPaths: string[] = [];
    result.toolCalls.forEach((call, i) => {
      const read = reads[i]!;
      opened.push(...read.paths);
      roundPaths.push(...read.paths);
      readBudget -= read.text.length;
      messages.push({ role: 'tool', content: read.text, toolCallId: call.id });
    });

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
      maxTokens: ANSWER_TOKENS,
      ...(canReadMore ? { tools: TOOLS } : {}),
    });
  }

  // A model that runs out of budget stops mid-sentence. Ask it to carry on from
  // where it stopped rather than saving a severed answer — the reader did not
  // choose the token limit and should not see it.
  let full = result.text;
  for (let i = 0; i < MAX_CONTINUATIONS && result.finishReason === 'length'; i += 1) {
    messages.push({ role: 'assistant', content: result.text });
    messages.push({
      role: 'user',
      content:
        'That was cut off mid-sentence. Continue from exactly where you stopped. ' +
        'Do not repeat anything, do not re-introduce the topic, do not start a new ' +
        'heading unless the previous one genuinely ended — just carry straight on.',
    });
    logger.info(`Answer hit the token limit; continuing (${i + 1}/${MAX_CONTINUATIONS})`);
    result = await run({
      messages,
      temperature: 0.4,
      maxTokens: ANSWER_TOKENS,
    });
    // Join without a space: the model resumes mid-sentence.
    full += result.text;
  }

  // Still truncated after the allowed continuations. This used to append a line
  // of italics telling the reader to ask it to continue — a dead end dressed as
  // a hint. It is a flag now, and the thread offers a button that resumes it.
  const truncated = result.finishReason === 'length';

  const answer = stripTextToolCalls(full).trim();
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
    truncated,
  };
}
