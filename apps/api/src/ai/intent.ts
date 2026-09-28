/**
 * What kind of message the user sent.
 *
 * Every message used to be forced down the code-explanation path, so "hi there"
 * was tokenised into keywords, substring-matched against component names, and
 * answered with a walkthrough of whatever file happened to contain "hi". A chat
 * has to handle being talked to, not just interrogated.
 */
export type QuestionIntent = 'smalltalk' | 'overview' | 'code';

/** A greeting at the start of a message, which may still be followed by a real question. */
const LEADING_GREETING =
  /^(hi|hey|hello|yo|sup|hola|namaste|good\s+(?:morning|afternoon|evening))\b[\s,.!-]*/i;

/** Words that carry no question on their own — "hi there", "hello everyone". */
const FILLER = /^(there|everyone|all|folks|guys|team|again|mate|bro)\b[\s,.!?-]*/i;

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

  // "hi, can you explain the router?" is a real question wearing a greeting.
  // Strip the greeting and judge what is left; if nothing is, it was just hello.
  const withoutGreeting = q.replace(LEADING_GREETING, '').replace(FILLER, '').trim();
  if (withoutGreeting.length === 0) return 'smalltalk';

  const subject = withoutGreeting;
  if (subject.split(/\s+/).length <= 6 && SMALLTALK.some((re) => re.test(subject))) {
    return 'smalltalk';
  }
  if (OVERVIEW.some((re) => re.test(subject))) return 'overview';
  return 'code';
}
