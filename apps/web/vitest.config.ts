import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure logic only (parsing, filtering); nothing here needs a DOM.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
