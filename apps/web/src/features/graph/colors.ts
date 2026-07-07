import type { CSSProperties } from 'react';

/**
 * A curated categorical palette — distinct hues at similar lightness/chroma so
 * they read as one system on the dark UI. Colors are assigned per folder so a
 * component's "neighborhood" is visible at a glance.
 */
export const PALETTE = [
  '#818cf8', // indigo
  '#22d3ee', // cyan
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#a78bfa', // violet
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#60a5fa', // blue
  '#f87171', // red
  '#a3e635', // lime
  '#e879f9', // fuchsia
];

/** Immediate parent folder of a repo-relative path. */
export function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '/' : path.slice(0, i);
}

/** Folder names that "contain" features; the segment after one names the area. */
const CONTAINERS = new Set([
  'features', 'feature', 'app', 'pages', 'screens', 'modules', 'views', 'routes',
  'components', 'src', 'lib', 'services', 'controllers', 'containers', 'apps',
]);

/**
 * Derives a human "feature area" from a file path — the segment just after the
 * deepest recognized container folder (e.g. `.../features/graph/X` → "graph",
 * `.../app/rides/Y` → "rides"). Falls back to the last folder.
 */
export function featureOf(path: string): string {
  const parts = path.split('/');
  parts.pop(); // drop filename
  if (parts.length === 0) return 'root';
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (CONTAINERS.has(parts[i]!.toLowerCase()) && i + 1 < parts.length) {
      return parts[i + 1]!;
    }
  }
  return parts[parts.length - 1]!;
}

/** Prettifies a feature key for display, e.g. "(tabs)" → "Tabs", "ui" → "Ui". */
export function featureLabel(key: string): string {
  const clean = key.replace(/[()[\]]/g, '').replace(/[-_]+/g, ' ').trim() || key;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Deterministically maps a key (folder) to a palette color. */
export function colorForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Soft tinted surface + border + text for a chip/badge in the given color. */
export function tint(color: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
    color,
  };
}
