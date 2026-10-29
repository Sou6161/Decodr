import path from 'node:path';
import ts from 'typescript';

/**
 * Chooses a ScriptKind per extension. React `.js`/`.jsx` files are parsed as
 * JSX so components in non-TS projects are still detected; `.ts` stays TS so
 * angle-bracket type assertions parse correctly.
 */
export function scriptKindFor(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.ts':
      return ts.ScriptKind.TS;
    case '.jsx':
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.Unknown;
  }
}

/** 1-based line number for a source position. */
export function lineAt(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

/** React component naming convention: PascalCase. */
export function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/** React hook naming convention: `use` followed by an uppercase letter/digit. */
export function isHookName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name);
}

/**
 * `React.createElement(...)` / `createElement(...)` — the call JSX compiles to.
 * Components written without JSX syntax (older code, some libraries) render
 * this way, and were not recognised as components at all.
 */
function isCreateElementCall(n: ts.Node): n is ts.CallExpression {
  if (!ts.isCallExpression(n)) return false;
  const callee = n.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'createElement';
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'createElement';
}

/** True if the subtree renders anything: JSX, or a createElement call. */
export function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n) ||
      isCreateElementCall(n)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Leftmost identifier of a JSX tag name (`Motion.div` → `Motion`). */
export function rootTagIdentifier(tagName: ts.JsxTagNameExpression): string | null {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) {
    let expr: ts.Expression = tagName;
    while (ts.isPropertyAccessExpression(expr)) expr = expr.expression;
    return ts.isIdentifier(expr) ? expr.text : null;
  }
  return null;
}

/**
 * The tag as written when it is `Namespace.Member` (`UI.Button`), else null.
 * Kept whole so the graph can follow `import * as UI from './ui'` to the
 * file that declares `Button`.
 */
function memberTag(tagName: ts.JsxTagNameExpression): string | null {
  if (!ts.isPropertyAccessExpression(tagName) || !ts.isIdentifier(tagName.expression)) return null;
  return `${tagName.expression.text}.${tagName.name.text}`;
}

/**
 * Collects the component tags rendered within a subtree — these are the
 * components this component renders (its outgoing graph edges).
 *
 * `Header` and `Motion.div` contribute their PascalCase root; `UI.Button`
 * also contributes the full member form, because a lowercase or PascalCase
 * namespace import is resolved through its member, not its root. The first
 * argument of `createElement(Header, …)` counts as a rendered tag too.
 */
export function collectRenderedTags(node: ts.Node): string[] {
  const tags = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const name = rootTagIdentifier(n.tagName);
      if (name && isComponentName(name)) tags.add(name);
      const member = memberTag(n.tagName);
      if (member && isComponentName(member.split('.')[1]!)) tags.add(member);
    } else if (isCreateElementCall(n)) {
      const first = n.arguments[0];
      if (first && ts.isIdentifier(first) && isComponentName(first.text)) tags.add(first.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return [...tags];
}

/** Whether a node carries a given modifier (e.g. export / default). */
export function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false;
}

/** Derives a component name for an anonymous default export from its path. */
export function nameFromPath(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  if (base.toLowerCase() === 'index') {
    const parent = path.basename(path.dirname(filePath));
    return parent && parent !== '.' ? parent : 'Index';
  }
  return base;
}
