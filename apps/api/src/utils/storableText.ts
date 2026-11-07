/**
 * Postgres text columns reject the NUL character outright, and one stray NUL
 * used to fail a whole project's analysis. Swap it for the Unicode replacement
 * character so the text keeps its length and every other character.
 */
export function storableText(text: string): string {
  return text.includes('\u0000') ? text.replace(/\u0000/g, '�') : text;
}
