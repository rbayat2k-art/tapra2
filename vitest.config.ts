import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts', 'src/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
