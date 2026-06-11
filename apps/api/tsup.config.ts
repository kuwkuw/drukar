import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Shared package ships TS source; bundle it so the production runtime never sees .ts.
  noExternal: ['@drukar/shared'],
});
