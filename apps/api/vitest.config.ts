import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // manifold-3d WASM init can be slow on first load in CI.
    testTimeout: 30_000,
  },
});
