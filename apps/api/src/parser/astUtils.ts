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

/** True if the subtree contains any JSX. */
export function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n)
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
function rootTagIdentifier(tagName: ts.JsxTagNameExpression): string | null {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) {
    let expr: ts.Expression = tagName;
    while (ts.isPropertyAccessExpression(expr)) expr = expr.expression;
    return ts.isIdentifier(expr) ? expr.text : null;
  }
  return null;
}

/**
 * Collects PascalCase JSX tag names rendered within a subtree — these are the
 * components this component renders (its outgoing graph edges).
 */
export function collectRenderedTags(node: ts.Node): string[] {
  const tags = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const name = rootTagIdentifier(n.tagName);
      if (name && isComponentName(name)) tags.add(name);
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
