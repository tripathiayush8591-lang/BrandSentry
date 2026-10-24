import { defineConfig, type UserConfig } from 'vite';
import type { InlineConfig } from 'vitest/node';
import react from '@vitejs/plugin-react';

interface VitestConfigExport extends UserConfig {
  test?: InlineConfig;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Browser tests run beside the local app. Sharing an optimizer cache lets
  // one server overwrite the other's chunks and split Firebase's registry.
  cacheDir: `node_modules/.vite/${mode}`,
  optimizeDeps: { include: ['@firebase/app', '@firebase/auth'] },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    css: true,
  },
} as VitestConfigExport));
