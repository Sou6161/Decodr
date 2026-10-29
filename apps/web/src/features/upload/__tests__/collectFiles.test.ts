import { describe, expect, it } from 'vitest';
import { isWantedPath } from '../collectFiles';

describe('isWantedPath', () => {
  it('keeps source files and manifests, including tsconfig variants', () => {
    for (const p of [
      'app/src/App.tsx',
      'app/package.json',
      'app/tsconfig.json',
      'app/tsconfig.app.json',
      'app/jsconfig.json',
      'app/.env.example',
    ]) {
      expect(isWantedPath(p)).toBe(true);
    }
  });

  it('never uploads a real .env, dependencies or build output', () => {
    for (const p of [
      'app/.env',
      'app/.env.local',
      'app/node_modules/react/index.js',
      'app/dist/main.js',
      'app/ios/Pods/x.js',
      'app/logo.png',
    ]) {
      expect(isWantedPath(p)).toBe(false);
    }
  });
});
