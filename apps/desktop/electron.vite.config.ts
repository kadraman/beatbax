import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@beatbax/app-core': resolve(__dirname, '../../packages/app-core/src'),
        fs: resolve(__dirname, 'src/renderer/src/electron-fs.ts'),
        path: resolve(__dirname, '../web-ui/src/utils/browser-path.ts'),
      },
      conditions: ['browser', 'module', 'import', 'default'],
    },
    define: {
      global: 'globalThis',
      __CLIENT_PROFILE__: '"desktop-full"',
    },
    optimizeDeps: {
      include: ['monaco-editor', 'buffer'],
      exclude: ['@beatbax/engine'],
    },
    plugins: [react()],
  },
});
