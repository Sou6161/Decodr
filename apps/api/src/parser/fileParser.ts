import ts from 'typescript';
import { ExportKind } from '@decodr/types';
import type {
  ParsedComponent,
  ParsedFile,
  ParsedHook,
  ParsedImport,
  ParsedImportName,
  ParsedReExport,
} from './types.js';
import {
  collectRenderedTags,
  containsJsx,
  hasModifier,
  isComponentName,
  isHookName,
  lineAt,
  nameFromPath,
  scriptKindFor,
} from './astUtils.js';
import { isRelativeSpecifier, resolveModule, type AliasConfig } from './moduleResolver.js';
import { parseRoutes } from './routeParser.js';

/** Exported-symbol summary for a file (populated in a first pass). */
interface ExportInfo {
  named: Set<string>;
  defaultName: string | null;
  /** Anonymous `export default <fn|class|call>` expression, if any. */
  defaultAnon: ts.Expression | null;
}

/**
 * Parses one source file into components, hooks, imports, and routes using the
 * TypeScript AST (no regular expressions). Purely syntactic — no type-checker —
 * which keeps it fast and dependency-light.
 */
export function parseFile(
  filePath: string,
  content: string,
  knownFiles: ReadonlySet<string>,
  /** tsconfig/jsconfig `paths` and `baseUrl`, so `@/components/X` resolves. */
  aliases: readonly AliasConfig[] = [],
): ParsedFile {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(filePath),
  );

  const resolve = (specifier: string) => resolveModule(filePath, specifier, knownFiles, aliases);
  const imports = [...parseImports(sourceFile, resolve), ...parseLazyImports(sourceFile, resolve)];
  const reExports = parseReExports(sourceFile, resolve);
  const exports = collectExports(sourceFile);
  const { components, hooks } = collectDeclarations(sourceFile, filePath, exports);
  const routes = parseRoutes(sourceFile);

  return { path: filePath, components, hooks, imports, reExports, routes };
}

type Resolve = (specifier: string) => string | null;

function toImport(specifier: string, resolve: Resolve, names: ParsedImportName[]): ParsedImport {
  const resolvedPath = resolve(specifier);
  return {
    moduleSpecifier: specifier,
    resolvedPath,
    // An alias that resolved is local code; an unresolved bare name is a package.
    isExternal: resolvedPath === null && !isRelativeSpecifier(specifier),
    names,
  };
}

/** `import('./X')` with a literal specifier, as written inside `lazy(...)`. */
function dynamicImportSpecifier(node: ts.Node): string | null {
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0])
    ) {
      found = n.arguments[0].text;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** True for `lazy(...)` and `React.lazy(...)`. */
function isLazyCall(node: ts.Expression): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'lazy';
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'lazy';
}

/** True for `require('./x')` with a literal specifier. */
function requireSpecifier(node: ts.Expression): string | null {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

/**
 * Imports that are not import declarations, but bind a local name to another
 * module just the same:
 *
 *   const Settings = lazy(() => import('./Settings'));   // code-split route
 *   const Header = require('./Header');                    // CommonJS
 *
 * Both read as default imports. Route-level code splitting is common enough
 * that ignoring it left a router's every screen disconnected from the graph.
 */
function parseLazyImports(sourceFile: ts.SourceFile, resolve: Resolve): ParsedImport[] {
  const imports: ParsedImport[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!decl.initializer) continue;
      const lazySpec = isLazyCall(decl.initializer) ? dynamicImportSpecifier(decl.initializer) : null;
      const specifier = lazySpec ?? requireSpecifier(decl.initializer);
      if (!specifier) continue;

      if (ts.isIdentifier(decl.name)) {
        imports.push(
          toImport(specifier, resolve, [{ local: decl.name.text, imported: 'default', isDefault: true }]),
        );
      } else if (!lazySpec && ts.isObjectBindingPattern(decl.name)) {
        // const { Header, Footer: Foot } = require('./layout')
        const names: ParsedImportName[] = [];
        for (const el of decl.name.elements) {
          if (!ts.isIdentifier(el.name)) continue;
          const imported =
            el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
          names.push({ local: el.name.text, imported, isDefault: false });
        }
        imports.push(toImport(specifier, resolve, names));
      }
    }
  }
  return imports;
}

/** `export { A } from './a'`, `export { default as B } from './b'`, `export * from './c'`. */
function parseReExports(sourceFile: ts.SourceFile, resolve: Resolve): ParsedReExport[] {
  const out: ParsedReExport[] = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const resolvedPath = resolve(statement.moduleSpecifier.text);
    const clause = statement.exportClause;
    if (!clause) {
      out.push({ exported: '*', imported: '*', resolvedPath });
    } else if (ts.isNamespaceExport(clause)) {
      // export * as UI from './ui' — UI.Button is followed through '*'.
      out.push({ exported: clause.name.text, imported: '*', resolvedPath });
    } else {
      for (const el of clause.elements) {
        out.push({
          exported: el.name.text,
          imported: (el.propertyName ?? el.name).text,
          resolvedPath,
        });
      }
    }
  }
  return out;
}

function parseImports(sourceFile: ts.SourceFile, resolve: Resolve): ParsedImport[] {
  const imports: ParsedImport[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const specifier = statement.moduleSpecifier.text;
    const names: ParsedImportName[] = [];
    const clause = statement.importClause;

    if (clause?.name) {
      names.push({ local: clause.name.text, imported: 'default', isDefault: true });
    }
    if (clause?.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        names.push({
          local: clause.namedBindings.name.text,
          imported: '*',
          isDefault: false,
        });
      } else {
        for (const el of clause.namedBindings.elements) {
          names.push({
            local: el.name.text,
            imported: (el.propertyName ?? el.name).text,
            isDefault: false,
          });
        }
      }
    }

    imports.push(toImport(specifier, resolve, names));
  }

  return imports;
}

function collectExports(sourceFile: ts.SourceFile): ExportInfo {
  const info: ExportInfo = { named: new Set(), defaultName: null, defaultAnon: null };

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (ts.isIdentifier(statement.expression)) {
        info.defaultName = statement.expression.text;
      } else {
        info.defaultAnon = statement.expression;
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      // `export { X } from './x'` re-exports another file's X; it says nothing
      // about a local X, so it belongs to parseReExports, not here.
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const el of statement.exportClause.elements) {
        if (el.name.text === 'default' && el.propertyName) {
          info.defaultName = el.propertyName.text;
        } else {
          info.named.add(el.name.text);
        }
      }
    }
  }

  return info;
}

function collectDeclarations(
  sourceFile: ts.SourceFile,
  filePath: string,
  exports: ExportInfo,
): { components: ParsedComponent[]; hooks: ParsedHook[] } {
  const components: ParsedComponent[] = [];
  const hooks: ParsedHook[] = [];

  // `inlineExport` covers the `export function Foo()` / `export const Foo =`
  // form, where the keyword sits on the declaration itself. collectExports only
  // sees `export { Foo }` and `export default`, so without this the most common
  // React export style was reported as not exported.
  const exportMeta = (name: string, defaultInline: boolean, inlineExport: boolean) => {
    const isDefault = defaultInline || exports.defaultName === name;
    const isExported = isDefault || inlineExport || exports.named.has(name);
    return {
      isDefaultExport: isDefault,
      isExported,
      exportKind: isDefault ? ExportKind.Default : ExportKind.Named,
    };
  };

  const addComponent = (
    name: string,
    span: ts.Node,
    defaultInline: boolean,
    inlineExport = false,
  ) => {
    const start = lineAt(sourceFile, span.getStart(sourceFile));
    components.push({
      name,
      startLine: start,
      endLine: lineAt(sourceFile, span.getEnd()),
      renderedTags: collectRenderedTags(span),
      ...exportMeta(name, defaultInline, inlineExport),
    });
  };

  const addHook = (
    name: string,
    span: ts.Node,
    defaultInline: boolean,
    inlineExport = false,
  ) => {
    hooks.push({
      name,
      startLine: lineAt(sourceFile, span.getStart(sourceFile)),
      endLine: lineAt(sourceFile, span.getEnd()),
      ...exportMeta(name, defaultInline, inlineExport),
    });
  };

  for (const statement of sourceFile.statements) {
    const defaultInline = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    const inlineExport = hasModifier(statement, ts.SyntaxKind.ExportKeyword);

    if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text ?? (defaultInline ? nameFromPath(filePath) : null);
      if (!name) continue;
      if (isHookName(name)) addHook(name, statement, defaultInline, inlineExport);
      else if (isComponentName(name) && containsJsx(statement)) {
        addComponent(name, statement, defaultInline, inlineExport);
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const name = decl.name.text;
        if (isHookName(name) && isFunctionLike(decl.initializer)) {
          addHook(name, decl, false, inlineExport);
        } else if (isComponentName(name) && isComponentInitializer(decl.initializer)) {
          addComponent(name, decl, false, inlineExport);
        }
      }
    } else if (ts.isClassDeclaration(statement)) {
      const name = statement.name?.text ?? (defaultInline ? nameFromPath(filePath) : null);
      if (name && isComponentName(name) && isClassComponent(statement)) {
        addComponent(name, statement, defaultInline, inlineExport);
      }
    }
  }

  // Anonymous `export default () => <jsx/>` / `export default memo(...)`.
  if (exports.defaultAnon && isComponentInitializer(exports.defaultAnon)) {
    const name = nameFromPath(filePath);
    if (!components.some((c) => c.name === name)) {
      addComponent(name, exports.defaultAnon, true);
    }
  }

  return { components, hooks };
}

function isFunctionLike(node: ts.Node): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/** Arrow/function returning JSX, or a HOC call (memo/forwardRef) wrapping one. */
function isComponentInitializer(node: ts.Expression): boolean {
  if (isFunctionLike(node)) return containsJsx(node);
  if (ts.isCallExpression(node)) {
    return node.arguments.some((arg) => isFunctionLike(arg) && containsJsx(arg));
  }
  return false;
}

function isClassComponent(node: ts.ClassDeclaration): boolean {
  const extendsComponent = node.heritageClauses?.some((clause) =>
    clause.types.some((t) => {
      const text = t.expression.getText();
      return text.endsWith('Component') || text.endsWith('PureComponent');
    }),
  );
  return Boolean(extendsComponent) || containsJsx(node);
}
