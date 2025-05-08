import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    chaiConfig: {
      truncateThreshold: 0, // 0 = disable truncation completely
    },

    diff: {
      truncateThreshold: 0,

      expand: true,
    },
    setupFiles: [`${root}/packages/core/src/test/setup-request-matcher.ts`],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
    },
  },
});
