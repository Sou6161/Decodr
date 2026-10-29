/**
 * Pulls the actual answer out of a short utility completion — a title, a
 * follow-up list, a conversation memo.
 *
 * Some models reason out loud in the reply text itself rather than in a
 * separate field: "The user is asking about the Counter component. This is a
 * question about React state…". Measured against the production model, every
 * title request did this and ran out of its 24-token budget mid-sentence, so
 * generated titles had never once worked, and follow-ups failed the same way
 * whenever the model chose to think first.
 *
 * Banning the reasoning does not work reliably — the model ignores the ban. So
 * these calls allow it, ask for the result on lines marked `FINAL:` at the end,
 * and read only those. With that instruction and room to finish, the same model
 * went 5 for 5 and mostly stopped narrating altogether.
 */

/** Appended to a utility prompt to request marked output. */
export function finalLineInstruction(what: string, opts: { many?: boolean } = {}): string {
  return opts.many
    ? `\n\nYou may think first if you need to. Then END your reply with ${what}, each on its own line starting with "FINAL: ". Lines without that prefix are ignored.`
    : `\n\nYou may think first if you need to. Then END your reply with ${what} on one line of the form:\nFINAL: <${what}>`;
}

// Bold may wrap the word or the colon too: "**FINAL**:" and "**FINAL:**" both occur.
const FINAL_LINE = /^\s*\**FINAL\**\s*:\**\s*(.*)$/gim;

/** Every `FINAL:` line's content, in order. Empty when the model used none. */
export function finalLines(text: string): string[] {
  return [...text.matchAll(FINAL_LINE)].map((m) => m[1]!.trim()).filter(Boolean);
}

/**
 * Everything after the LAST `FINAL:` marker, for answers longer than a line.
 * Null when there is no marker.
 */
export function afterFinalMarker(text: string): string | null {
  const matches = [...text.matchAll(FINAL_LINE)];
  const last = matches.at(-1);
  if (!last || last.index === undefined) return null;
  // The rest of the marker's own line, plus every line after it.
  return text.slice(last.index).replace(/^\s*\**FINAL\**\s*:\**\s*/i, '').trim() || null;
}
