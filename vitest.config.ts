import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  define: {
    'import.meta.vitest': 'undefined',
  },
  test: {
    root,
    globals: true,
    environment: 'node',
    chaiConfig: {
      truncateThreshold: 0, // 0 = disable truncation completely
    },

    diff: {
      truncateThreshold: 0,

      expand: true,
    },
    include: [`${root}/packages/*/src/**/*.test.ts`],
    includeSource: [`${root}/packages/*/src/**/*.ts`],
    setupFiles: [`${root}/packages/core/src/test/setup-request-matcher.ts`],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
    },
  },
});
