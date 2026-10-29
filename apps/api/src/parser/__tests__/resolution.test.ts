import { describe, expect, it } from 'vitest';
import { parseFile } from '../fileParser.js';
import { readAliasConfigs, resolveModule } from '../moduleResolver.js';
import { parseRoutes } from '../routeParser.js';
import { buildComponentEdges } from '../../graph/graphBuilder.js';
import ts from 'typescript';

const edgesOf = (sources: Record<string, string>, configs: Record<string, string> = {}) => {
  const known = new Set([...Object.keys(sources), ...Object.keys(configs)]);
  const aliases = readAliasConfigs(new Map(Object.entries(configs)));
  const parsed = Object.entries(sources).map(([p, src]) => parseFile(p, src, known, aliases));
  return buildComponentEdges(parsed).map((e) => `${e.source.name}->${e.target.name}`);
};

describe('resolveModule', () => {
  const known = new Set(['src/a.ts', 'src/ui/Button.tsx', 'src/ui/index.ts']);

  it('maps a NodeNext-style .js specifier to its .ts source (regression: Decodr itself)', () => {
    expect(resolveModule('src/b.ts', './a.js', known)).toBe('src/a.ts');
  });

  it('maps .jsx to .tsx', () => {
    expect(resolveModule('src/b.tsx', './ui/Button.jsx', known)).toBe('src/ui/Button.tsx');
  });

  it('resolves tsconfig paths, including comments and trailing commas', () => {
    const aliases = readAliasConfigs(
      new Map([
        ['tsconfig.json', '{ // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, }, }'],
      ]),
    );
    expect(resolveModule('src/b.ts', '@/ui/Button', known, aliases)).toBe('src/ui/Button.tsx');
  });

  it('resolves paths without a baseUrl relative to the declaring config, through extends', () => {
    const files = new Set(['web/src/x/Card.tsx']);
    const aliases = readAliasConfigs(
      new Map([
        ['web/tsconfig.base.json', '{"compilerOptions":{"paths":{"~ui/*":["./src/x/*"]}}}'],
        ['web/tsconfig.app.json', '{"extends":"./tsconfig.base.json"}'],
      ]),
    );
    expect(resolveModule('web/src/main.tsx', '~ui/Card', files, aliases)).toBe('web/src/x/Card.tsx');
  });

  it('falls back to @/ meaning src/ when no config says otherwise', () => {
    expect(resolveModule('src/pages/Home.tsx', '@/ui', known)).toBe('src/ui/index.ts');
  });

  it('leaves npm packages unresolved', () => {
    expect(resolveModule('src/b.ts', 'react', known)).toBeNull();
    expect(resolveModule('src/b.ts', '@tanstack/react-query', known)).toBeNull();
  });
});

describe('graph edges', () => {
  it('follows a barrel re-export to the declaring file', () => {
    expect(
      edgesOf({
        'src/App.tsx': "import { Button } from './ui';\nexport function App() { return <Button/>; }",
        'src/ui/index.ts': "export { Button } from './Button';",
        'src/ui/Button.tsx': 'export function Button() { return <button/>; }',
      }),
    ).toEqual(['App->Button']);
  });

  it('follows export * and default-as re-exports through two levels', () => {
    expect(
      edgesOf({
        'src/App.tsx': "import { Card } from './components';\nexport function App() { return <Card/>; }",
        'src/components/index.ts': "export * from './ui';",
        'src/components/ui/index.ts': "export { default as Card } from './Card';",
        'src/components/ui/Card.tsx': 'export default function Card() { return <div/>; }',
      }),
    ).toEqual(['App->Card']);
  });

  it('resolves members of a namespace import', () => {
    expect(
      edgesOf({
        'src/App.tsx': "import * as UI from './ui';\nexport function App() { return <UI.Button/>; }",
        'src/ui.tsx': 'export function Button() { return <button/>; }',
      }),
    ).toEqual(['App->Button']);
  });

  it('links lazy-loaded route components', () => {
    expect(
      edgesOf({
        'src/App.tsx':
          "import { lazy } from 'react';\nconst Settings = lazy(() => import('./Settings'));\n" +
          'export function App() { return <Settings/>; }',
        'src/Settings.tsx': 'export default function Settings() { return <div/>; }',
      }),
    ).toEqual(['App->Settings']);
  });

  it('resolves aliased imports into edges', () => {
    expect(
      edgesOf(
        {
          'src/App.tsx': "import { Nav } from '@/layout/Nav';\nexport function App() { return <Nav/>; }",
          'src/layout/Nav.tsx': 'export const Nav = () => <nav/>;',
        },
        { 'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}' },
      ),
    ).toEqual(['App->Nav']);
  });

  it('detects createElement components and their children', () => {
    expect(
      edgesOf({
        'src/App.js':
          "import { Header } from './Header';\nexport function App() { return React.createElement(Header, null); }",
        'src/Header.js': "export function Header() { return React.createElement('h1', null, 'x'); }",
      }),
    ).toEqual(['App->Header']);
  });
});

describe('parseRoutes', () => {
  const routes = (src: string) =>
    parseRoutes(ts.createSourceFile('r.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));

  it('joins nested JSX routes onto their parent', () => {
    const r = routes(
      '<Routes><Route path="/dash" element={<Dash/>}><Route index element={<Home/>}/>' +
        '<Route path="settings" element={<Settings/>}/></Route></Routes>',
    );
    expect(r).toEqual([
      { path: '/dash', componentName: 'Dash' },
      { path: '/dash', componentName: 'Home' },
      { path: '/dash/settings', componentName: 'Settings' },
    ]);
  });

  it('joins nested config children', () => {
    const r = routes(
      "createBrowserRouter([{ path: '/', element: <Shell/>, children: [{ path: 'about', element: <About/> }] }])",
    );
    expect(r.map((x) => x.path)).toEqual(['/', '/about']);
  });

  it('ignores objects that merely have a path (regression: nav configs became routes)', () => {
    expect(routes("const nav = [{ path: '/x', label: 'X' }, { path: 'src/a.ts', size: 1 }];")).toEqual([]);
  });
});
