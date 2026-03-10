import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@core': path.resolve(__dirname, 'src/core'),
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    pool: 'threads',
  },
});
