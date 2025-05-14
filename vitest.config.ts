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
    setupFiles: ['./tests/src/setup/log-matchers.ts', './tests/src/setup/request-matcher.ts'],
    chaiConfig: {
      truncateThreshold: 0, // 0 = disable truncation completely
    },

    diff: {
      truncateThreshold: 0,

      expand: true,
    },
    include: [`${root}/packages/*/src/**/*.test.ts`, `${root}/tests/src/**/*.test.ts`],
    includeSource: [`${root}/packages/*/src/**/*.ts`],

    coverage: {
      enabled: true,
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
    },
  },
});
