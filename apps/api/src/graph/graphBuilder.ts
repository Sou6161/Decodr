import type { ParsedComponent, ParsedFile, ParsedReExport } from '../parser/types.js';

/** A component addressed by its declaring file + name. */
export interface ComponentRef {
  path: string;
  name: string;
}

/** A directed "renders" relationship between two components. */
export interface ComponentEdgeRef {
  source: ComponentRef;
  target: ComponentRef;
}

const key = (path: string, name: string): string => `${path}::${name}`;

/**
 * How many re-export hops to follow. Real barrels are one or two deep
 * (`components/index.ts` → `components/ui/index.ts` → `Button.tsx`); the bound
 * exists so a cycle of `export *` files cannot loop.
 */
const MAX_REEXPORT_DEPTH = 6;

/**
 * Builds the component relationship graph.
 *
 * For each component, its rendered JSX tags are resolved — first to a
 * same-file component, otherwise through the file's imports to a component in
 * another file (respecting default vs named imports). Imports that land on a
 * barrel are followed through its re-exports to the file that actually
 * declares the component, and `<UI.Button>` from `import * as UI` is resolved
 * by its member name. Each resolved pair becomes a directed RENDERS edge
 * (source renders target). Self-edges and unresolved/external tags are ignored.
 */
export function buildComponentEdges(files: ParsedFile[]): ComponentEdgeRef[] {
  // Indexes over all known components.
  const componentsInFile = new Map<string, Map<string, ParsedComponent>>();
  const defaultComponentInFile = new Map<string, ParsedComponent>();
  const reExportsInFile = new Map<string, ParsedReExport[]>();

  for (const file of files) {
    const byName = new Map<string, ParsedComponent>();
    for (const component of file.components) {
      byName.set(component.name, component);
      if (component.isDefaultExport) defaultComponentInFile.set(file.path, component);
    }
    componentsInFile.set(file.path, byName);
    reExportsInFile.set(file.path, file.reExports ?? []);
  }

  /**
   * Finds the component a module exports under `name` ('default' for its
   * default export), following re-exports when the module only forwards it.
   */
  const resolveExport = (
    path: string,
    name: string,
    depth = 0,
  ): ComponentRef | null => {
    if (depth > MAX_REEXPORT_DEPTH) return null;

    const own =
      name === 'default' ? defaultComponentInFile.get(path) : componentsInFile.get(path)?.get(name);
    if (own) return { path, name: own.name };

    const forwards = reExportsInFile.get(path) ?? [];
    // An explicit `export { X } from` is checked before any `export *`, as in
    // ES module semantics, where a named export shadows a star export.
    for (const re of forwards) {
      if (re.exported === name && re.imported !== '*' && re.resolvedPath) {
        const found = resolveExport(re.resolvedPath, re.imported, depth + 1);
        if (found) return found;
      }
    }
    if (name !== 'default') {
      for (const re of forwards) {
        if (re.exported === '*' && re.resolvedPath) {
          const found = resolveExport(re.resolvedPath, name, depth + 1);
          if (found) return found;
        }
      }
    }
    return null;
  };

  /** `export * as UI from './ui'` turns `UI` into a namespace pointing at that file. */
  const namespaceTarget = (path: string, name: string): string | null => {
    for (const re of reExportsInFile.get(path) ?? []) {
      if (re.exported === name && re.imported === '*' && re.resolvedPath) return re.resolvedPath;
    }
    return null;
  };

  const edges: ComponentEdgeRef[] = [];
  const seen = new Set<string>();

  const pushEdge = (source: ComponentRef, target: ComponentRef): void => {
    if (source.path === target.path && source.name === target.name) return; // self
    const edgeKey = `${key(source.path, source.name)}->${key(target.path, target.name)}`;
    if (seen.has(edgeKey)) return;
    seen.add(edgeKey);
    edges.push({ source, target });
  };

  for (const file of files) {
    const localComponents = componentsInFile.get(file.path)!;

    // Map local identifier → resolved import binding.
    const importsByLocal = new Map<
      string,
      { resolvedPath: string; imported: string; isDefault: boolean }
    >();
    for (const imp of file.imports) {
      if (!imp.resolvedPath) continue;
      for (const n of imp.names) {
        importsByLocal.set(n.local, {
          resolvedPath: imp.resolvedPath,
          imported: n.imported,
          isDefault: n.isDefault,
        });
      }
    }

    for (const component of file.components) {
      const source: ComponentRef = { path: file.path, name: component.name };

      for (const tag of component.renderedTags) {
        // `UI.Button`: resolve the member through the namespace binding.
        const dot = tag.indexOf('.');
        if (dot !== -1) {
          const ns = importsByLocal.get(tag.slice(0, dot));
          if (!ns) continue;
          const member = tag.slice(dot + 1);
          // `import * as UI from './ui'`, or `import { UI } from './index'`
          // where the barrel says `export * as UI from './ui'`.
          const nsPath =
            ns.imported === '*' ? ns.resolvedPath : namespaceTarget(ns.resolvedPath, ns.imported);
          const target = nsPath ? resolveExport(nsPath, member) : null;
          if (target) pushEdge(source, target);
          continue;
        }

        // 1. Same-file component.
        if (localComponents.has(tag) && tag !== component.name) {
          pushEdge(source, { path: file.path, name: tag });
          continue;
        }

        // 2. Imported component — directly, or through a barrel's re-exports.
        const binding = importsByLocal.get(tag);
        if (!binding || binding.imported === '*') continue;
        const target = resolveExport(
          binding.resolvedPath,
          binding.isDefault ? 'default' : binding.imported,
        );
        if (target) pushEdge(source, target);
      }
    }
  }

  return edges;
}
