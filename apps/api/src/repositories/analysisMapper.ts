import type { File as FileModel, Hook as HookModel, Route as RouteModel } from '@prisma/client';
import type { ComponentNode, FileNode, HookNode, RouteNode } from '@arcloom/types';
import type { ComponentWithPath } from './componentRepository.js';

export function toFileNode(file: FileModel): FileNode {
  return {
    id: file.id,
    path: file.path,
    sizeBytes: file.sizeBytes,
    lineCount: file.lineCount,
  };
}

export function toComponentNode(component: ComponentWithPath): ComponentNode {
  return {
    id: component.id,
    name: component.name,
    filePath: component.file.path,
    exportKind: component.exportKind,
    isExported: component.isExported,
    startLine: component.startLine,
    endLine: component.endLine,
    importedByCount: component.importedByCount,
  };
}

export function toHookNode(hook: HookModel, filePath: string): HookNode {
  return {
    id: hook.id,
    name: hook.name,
    filePath,
    isExported: hook.isExported,
    startLine: hook.startLine,
    endLine: hook.endLine,
  };
}

export function toRouteNode(route: RouteModel): RouteNode {
  return {
    id: route.id,
    path: route.path,
    componentName: route.componentName,
    filePath: route.filePath,
  };
}
