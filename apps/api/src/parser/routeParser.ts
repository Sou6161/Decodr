import ts from 'typescript';
import type { ParsedRoute } from './types.js';
import { rootTagIdentifier } from './astUtils.js';

/**
 * Keys only a route object carries. An object literal is read as a route only
 * when it has a string `path` AND one of these — otherwise every nav config,
 * breadcrumb list or `{ path: 'src/x.ts' }` file record became a "route".
 */
const ROUTE_OBJECT_KEYS = new Set([
  'element',
  'Component',
  'component',
  'children',
  'index',
  'lazy',
  'loader',
  'action',
  'errorElement',
]);

/**
 * Joins a child route's path onto its parent's, the way React Router does:
 * `/dashboard` + `settings` → `/dashboard/settings`. An absolute child path
 * stands on its own.
 */
function joinPath(parent: string, child: string): string {
  if (child.startsWith('/')) return child;
  if (!parent) return child === '*' ? '*' : `/${child}`;
  return `${parent.replace(/\/+$/, '')}/${child}`;
}

/**
 * Extracts React Router routes in both supported forms:
 *   1. JSX:    <Route path="/x" element={<Home/>} />  (also `component={Home}`)
 *   2. Config: createBrowserRouter([{ path: '/x', element: <Home/> }])
 *
 * Nested routes — `<Route>` inside `<Route>`, or a config object's `children`
 * — are stored with their full URL, not the relative segment written on the
 * child, which is meaningless on its own. Index routes take their parent's URL.
 * Only statically-analyzable string paths are captured; dynamic paths are skipped.
 */
export function parseRoutes(sourceFile: ts.SourceFile): ParsedRoute[] {
  const routes: ParsedRoute[] = [];
  const seen = new Set<string>();

  const push = (route: ParsedRoute): void => {
    const key = `${route.path}::${route.componentName ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push(route);
  };

  const visit = (node: ts.Node, prefix: string): void => {
    // <Route path="x">…children…</Route>
    if (ts.isJsxElement(node) && isRouteTag(node.openingElement.tagName)) {
      const own = routeFromJsx(node.openingElement.attributes, prefix);
      if (own) push(own);
      const childPrefix = own?.path ?? prefix;
      for (const child of node.children) visit(child, childPrefix);
      return;
    }
    // <Route path="x" />
    if (ts.isJsxSelfClosingElement(node) && isRouteTag(node.tagName)) {
      const own = routeFromJsx(node.attributes, prefix);
      if (own) push(own);
      return;
    }
    // { path: 'x', element: <X/>, children: [...] }
    if (ts.isObjectLiteralExpression(node) && looksLikeRouteObject(node)) {
      const own = routeFromObject(node, prefix);
      if (own) push(own);
      const childPrefix = own?.path ?? prefix;
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText() === 'children') {
          visit(prop.initializer, childPrefix);
        } else {
          // `element: <Layout>…</Layout>` may itself contain JSX routes.
          ts.forEachChild(prop, (n) => visit(n, prefix));
        }
      }
      return;
    }
    ts.forEachChild(node, (n) => visit(n, prefix));
  };

  visit(sourceFile, '');
  return routes;
}

function isRouteTag(tagName: ts.JsxTagNameExpression): boolean {
  return ts.isIdentifier(tagName) && tagName.text === 'Route';
}

function findAttr(
  attributes: ts.JsxAttributes,
  name: string,
): ts.JsxAttribute | undefined {
  return attributes.properties.find(
    (p): p is ts.JsxAttribute =>
      ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function stringAttr(attributes: ts.JsxAttributes, name: string): string | null {
  const attr = findAttr(attributes, name);
  if (!attr?.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (
    ts.isJsxExpression(attr.initializer) &&
    attr.initializer.expression &&
    ts.isStringLiteral(attr.initializer.expression)
  ) {
    return attr.initializer.expression.text;
  }
  return null;
}

/** A `<Route>`'s full URL and component, or null for a pathless layout route. */
function routeFromJsx(attributes: ts.JsxAttributes, prefix: string): ParsedRoute | null {
  const own = stringAttr(attributes, 'path');
  const isIndex = Boolean(findAttr(attributes, 'index'));
  if (own === null && !(isIndex && prefix)) return null;
  return {
    path: own === null ? prefix : joinPath(prefix, own),
    componentName: routeComponentFromJsx(attributes),
  };
}

function routeComponentFromJsx(attributes: ts.JsxAttributes): string | null {
  // element={<Home/>}
  const element = findAttr(attributes, 'element');
  if (element?.initializer && ts.isJsxExpression(element.initializer)) {
    const expr = element.initializer.expression;
    if (expr && (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr))) {
      const opening = ts.isJsxElement(expr) ? expr.openingElement : expr;
      return rootTagIdentifier(opening.tagName);
    }
  }
  // component={Home} / Component={Home}
  for (const name of ['component', 'Component']) {
    const attr = findAttr(attributes, name);
    if (attr?.initializer && ts.isJsxExpression(attr.initializer)) {
      const expr = attr.initializer.expression;
      if (expr && ts.isIdentifier(expr)) return expr.text;
    }
  }
  return null;
}

function getProp(
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  const prop = obj.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && p.name.getText() === name,
  );
  return prop?.initializer;
}

function stringProp(obj: ts.ObjectLiteralExpression, name: string): string | null {
  const value = getProp(obj, name);
  return value && ts.isStringLiteral(value) ? value.text : null;
}

/** A route object has a path or `index`, and at least one route-only key. */
function looksLikeRouteObject(obj: ts.ObjectLiteralExpression): boolean {
  const names = obj.properties
    .filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
    .map((p) => p.name!.getText());
  const hasPathOrIndex = names.includes('path') || names.includes('index');
  return hasPathOrIndex && names.some((n) => ROUTE_OBJECT_KEYS.has(n));
}

function routeFromObject(obj: ts.ObjectLiteralExpression, prefix: string): ParsedRoute | null {
  const own = stringProp(obj, 'path');
  const isIndex = getProp(obj, 'index')?.kind === ts.SyntaxKind.TrueKeyword;
  if (own === null && !(isIndex && prefix)) return null;
  return {
    path: own === null ? prefix : joinPath(prefix, own),
    componentName: routeComponentFromObject(obj),
  };
}

function routeComponentFromObject(obj: ts.ObjectLiteralExpression): string | null {
  const element = getProp(obj, 'element');
  if (element && (ts.isJsxElement(element) || ts.isJsxSelfClosingElement(element))) {
    const opening = ts.isJsxElement(element) ? element.openingElement : element;
    return rootTagIdentifier(opening.tagName);
  }
  for (const name of ['Component', 'component']) {
    const value = getProp(obj, name);
    if (value && ts.isIdentifier(value)) return value.text;
  }
  return null;
}
