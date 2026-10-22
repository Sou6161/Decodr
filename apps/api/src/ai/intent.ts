/**
 * What kind of message the user sent.
 *
 * Every message used to be forced down the code-explanation path, so "hi there"
 * was tokenised into keywords, substring-matched against component names, and
 * answered with a walkthrough of whatever file happened to contain "hi". A chat
 * has to handle being talked to, not just interrogated.
 */
export type QuestionIntent = 'smalltalk' | 'general' | 'overview' | 'code';

/**
 * NOTE ON WHAT THIS IS FOR.
 *
 * This is a cost optimisation, not a correctness mechanism. The system prompt
 * handles any message on its own — a greeting sent down the code path still gets
 * a greeting back, because the prompt tells the model to answer what was
 * actually asked and ignore irrelevant attached files.
 *
 * What this buys is tokens: a recognised greeting skips retrieval entirely and
 * costs a few hundred tokens instead of the project map plus eight files. So it
 * is deliberately high-precision and low-recall — anything that might be a real
 * question falls through to the full path, where the model decides. Misses are
 * cheap; false positives would not be, which is why `ASKING` sends anything
 * resembling a request onward.
 */

/** A greeting at the start of a message, which may still be followed by a real question. */
const LEADING_GREETING =
  /^(hi|hey|hello|yo|sup|hola|namaste|good\s+(?:morning|afternoon|evening))\b[\s,.!-]*/i;

/**
 * Words that signal a real request rather than pleasantries. Checking for these
 * beats listing every possible term of address: "hi man", "hey dude", "hello
 * sir" are endless, but "explain", "how", "what" are a closed set.
 */
const ASKING =
  /\b(explain|show|tell|describe|list|find|give|walk|summar\w*|what|how|why|where|which|who|when|does|is|are|can)\b/i;

/**
 * Things that anchor a question to THIS project, so it must go down the
 * retrieval path. A demonstrative ("this component"), a locating verb ("where
 * is", "which file"), a path, or a PascalCase identifier are all referents.
 */
const PROJECT_REFERENT = [
  // "the dashboard page", "our auth middleware", "the useDashboard hook" — one
  // qualifier is allowed between the determiner and the noun, because that is
  // where the actual name usually sits.
  /\b(this|the|our|my|that)\s+(?:[\w-]+\s+)?(project|app|repo|repository|codebase|code|component|file|page|hook|route|router|routing|folder|function|module|feature|screen|endpoint|service|layout|middleware|store|context|provider|schema|config|api|test|build|flow)\b/i,
  /\b(in|from|of)\s+(this|the|our|my)\b/i,
  /\b(here|in here|in the app|in the project|in the code)\b/i,
  /\b(where\s+(is|are|does|do)|which\s+file|what\s+file|find|locate|used\s+by|imported\s+by)\b/i,
  // "deploy this", "run it locally" — a bare demonstrative is a referent when
  // the verb is something you do to a project.
  /\b(deploy|run|build|test|start|install|set\s*up|configure|host|publish)\s+(this|it)\b/i,
  // A file path, or an extension-bearing filename.
  /[\w-]+\/[\w-]+|\b[\w-]+\.(tsx?|jsx?|json|css|md)\b/i,
  // A PascalCase identifier — almost always a component in this project.
  /\b[A-Z][a-z]+[A-Z]\w*\b/,
];

/**
 * React's own hooks. A question naming one of these is about React, not about
 * this project — without the exclusion, "useMemo vs useCallback" would be read
 * as a question about their code because it names a `useX` identifier.
 */
const REACT_HOOKS =
  /^use(State|Effect|Memo|Callback|Ref|Context|Reducer|LayoutEffect|Id|Transition|DeferredValue|SyncExternalStore|ImperativeHandle|DebugValue|Optimistic|ActionState|FormStatus)$/;

/** A `useSomething` name that is not one of React's own, so it is theirs. */
function namesProjectHook(text: string): boolean {
  return (text.match(/\buse[A-Z]\w*\b/g) ?? []).some((h) => !REACT_HOOKS.test(h));
}

/**
 * Signals a question about programming in general rather than about this
 * repository: concepts, comparisons, how-to, "write me a …".
 */
const GENERAL_SIGNALS = [
  /\b(difference|differences)\s+between\b/i,
  /\s+vs\.?\s+/i,
  /\b(what|which)\s+(is|are)\s+(a|an|the)?\s*\b/i,
  /\bwhat\s+does\s+\w+\s+(mean|do)\b/i,
  /\bhow\s+(do|does|would|can|should)\s+(i|you|we|one)\b/i,
  /\bhow\s+to\b/i,
  /\b(best\s+practice|best\s+way|good\s+practice|anti[- ]pattern|convention)s?\b/i,
  /\b(should|would|could)\s+i\s+(use|pick|choose|prefer)\b/i,
  /\bwhen\s+(should|would)\s+(i|you|we)\b/i,
  /\b(pros\s+and\s+cons|trade[- ]?offs?|advantages?|disadvantages?)\b/i,
  /\b(write|create|generate|give|show)\s+me\b/i,
  /\b(write|create|generate|implement|build)\s+(a|an)\b/i,
  /\bbetter\s+than\b/i,
  /\bis\s+[\w.-]+\s+(better|faster|safer|worse|slower)\b/i,
  /\b(example|snippet|boilerplate|template)\b/i,
  /\b(recommend|suggest|advice|opinion)\b/i,
  /\b(teach|learn|understand)\s+(me\s+)?(about\s+)?\w+/i,
];

/**
 * Technologies that exist outside any one project. Naming one with no referent
 * to this codebase — "explain react server components", "what is tailwind's
 * jit" — is a question about the technology, and answering it from the file
 * that happened to import it is not an answer.
 */
const KNOWN_TECH =
  /\b(react|reactjs|typescript|javascript|node(?:js)?|npm|pnpm|yarn|vite|webpack|babel|esbuild|tailwind|css|scss|html|jsx|tsx|redux|zustand|mobx|graphql|rest|sql|postgres(?:ql)?|prisma|mongodb|express|next(?:\.?js)?|remix|jest|vitest|cypress|playwright|eslint|prettier|git|docker|websockets?|jwt|oauth|a11y|accessibility|seo)\b/i;

/** Greetings, thanks, and questions about the assistant rather than the code. */
const SMALLTALK = [
  /^(hi|hey|hello|yo|sup|hola|namaste|good\s+(morning|afternoon|evening))\b[\s!.]*$/i,
  /^(thanks|thank\s+you|thx|ty|cheers|nice|great|cool|ok|okay|got\s+it)\b[\s!.]*$/i,
  /^(who|what)\s+(are|r)\s+(you|u)\b/i,
  /^what\s+(can|do)\s+(you|u)\s+(do|help)/i,
  /^(help|how\s+do\s+i\s+use\s+(this|you))\b/i,
  /^(bye|goodbye|see\s+ya)\b/i,
];

/** Questions about the project as a whole rather than one piece of it. */
const OVERVIEW = [
  /\b(overview|summar(y|ise|ize)|high[- ]level|big\s+picture)\b/i,
  /^what\s+(is|does)\s+(this|the)\s+(project|app|repo|codebase|thing)\b/i,
  /^what('?s| is)\s+(this|it)\s+about\b/i,
  /\b(walk|take)\s+me\s+through\s+(the\s+)?(project|app|codebase|repo)\b/i,
  /\bwhere\s+(do|should)\s+i\s+start\b/i,
  /\bwhat\s+does\s+(this|it)\s+do\b/i,
];

/**
 * Classifies a message. Deliberately rule-based: an extra model call per message
 * would double latency and cost for something a handful of patterns settle, and
 * misclassifying towards `code` is harmless because that is the default path.
 */
export function classifyQuestion(question: string): QuestionIntent {
  const q = question.trim();

  // "hi, can you explain the router?" is a real question wearing a greeting;
  // "hi man" is just hello. Strip the greeting and judge what is left.
  const withoutGreeting = q.replace(LEADING_GREETING, '').trim();
  if (withoutGreeting.length === 0) return 'smalltalk';

  if (withoutGreeting !== q) {
    // It opened with a greeting. What follows is only a real question if it
    // actually asks something — otherwise it is a term of address ("man",
    // "dude", "everyone") and the whole message is a greeting.
    const words = withoutGreeting.split(/\s+/).length;
    if (words <= 3 && !withoutGreeting.includes('?') && !ASKING.test(withoutGreeting)) {
      return 'smalltalk';
    }
  }

  const subject = withoutGreeting;
  if (subject.split(/\s+/).length <= 6 && SMALLTALK.some((re) => re.test(subject))) {
    return 'smalltalk';
  }
  if (OVERVIEW.some((re) => re.test(subject))) return 'overview';

  // A question that reads like general programming knowledge and names nothing
  // in this project is answered from knowledge, not from retrieval. Sending
  // "what's the difference between useMemo and useCallback" through keyword
  // matching produced a walkthrough of whichever file happened to score
  // highest, which is not an answer to it.
  //
  // False positives here are cheap: the general path still carries the project
  // map and the same code tools, so a question that turns out to be about this
  // repo after all gets looked up rather than guessed at.
  if (
    (GENERAL_SIGNALS.some((re) => re.test(subject)) || KNOWN_TECH.test(subject)) &&
    !PROJECT_REFERENT.some((re) => re.test(subject)) &&
    !namesProjectHook(subject)
  ) {
    return 'general';
  }

  return 'code';
}
