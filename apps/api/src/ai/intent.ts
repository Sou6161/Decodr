/**
 * What kind of message the user sent.
 *
 * Every message used to be forced down the code-explanation path, so "hi there"
 * was tokenised into keywords, substring-matched against component names, and
 * answered with a walkthrough of whatever file happened to contain "hi". A chat
 * has to handle being talked to, not just interrogated.
 */
export type QuestionIntent = 'smalltalk' | 'overview' | 'code';

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
  return 'code';
}
