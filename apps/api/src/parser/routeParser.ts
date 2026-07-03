import ts from 'typescript';
import type { ParsedRoute } from './types.js';

/**
 * Extracts React Router routes in both supported forms:
 *   1. JSX:    <Route path="/x" element={<Home/>} />  (also `component={Home}`)
 *   2. Config: createBrowserRouter([{ path: '/x', element: <Home/> }])
 *
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

  const visit = (node: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      if (isRouteTag(node.tagName)) {
        const path = stringAttr(node.attributes, 'path');
        if (path !== null) {
          push({ path, componentName: routeComponentFromJsx(node.attributes) });
        }
      }
    } else if (ts.isObjectLiteralExpression(node)) {
      const path = stringProp(node, 'path');
      if (path !== null) {
        push({ path, componentName: routeComponentFromObject(node) });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return routes;
}

function isRouteTag(tagName: ts.JsxTagNameExpression): boolean {
  return ts.isIdentifier(tagName) && tagName.text === 'Route';
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
