import type { ParsedComponent, ParsedFile } from '../parser/types.js';

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
 * Builds the component relationship graph.
 *
 * For each component, its rendered PascalCase JSX tags are resolved — first to a
 * same-file component, otherwise through the file's imports to a component in
 * another file (respecting default vs named imports). Each resolved pair becomes
 * a directed RENDERS edge (source renders target). Self-edges (recursion) and
 * unresolved/external tags are ignored.
 */
export function buildComponentEdges(files: ParsedFile[]): ComponentEdgeRef[] {
  // Indexes over all known components.
  const componentsInFile = new Map<string, Map<string, ParsedComponent>>();
  const defaultComponentInFile = new Map<string, ParsedComponent>();

  for (const file of files) {
    const byName = new Map<string, ParsedComponent>();
    for (const component of file.components) {
      byName.set(component.name, component);
      if (component.isDefaultExport) defaultComponentInFile.set(file.path, component);
    }
    componentsInFile.set(file.path, byName);
  }

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
        // 1. Same-file component.
        if (localComponents.has(tag) && tag !== component.name) {
          pushEdge(source, { path: file.path, name: tag });
          continue;
        }

        // 2. Imported component.
        const binding = importsByLocal.get(tag);
        if (!binding) continue;

        const targetFileComponents = componentsInFile.get(binding.resolvedPath);
        if (!targetFileComponents) continue;

        const target = binding.isDefault
          ? defaultComponentInFile.get(binding.resolvedPath)
          : targetFileComponents.get(binding.imported);

        if (target) {
          pushEdge(source, { path: binding.resolvedPath, name: target.name });
        }
      }
    }
  }

  return edges;
}
