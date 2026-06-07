import { defineConfig } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  root: '.',
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@beatbax/app-core', replacement: path.resolve(__dirname, '../../packages/app-core/src') },
      // @beatbax/engine: resolve via node_modules junction (link-local-engine.cjs), not a
      // directory alias — subpaths like /chips must use package.json "exports" → dist/.
      // Capture engine export writeFileSync calls in the browser.
      { find: 'fs', replacement: path.resolve(__dirname, 'src/utils/browser-fs.ts') },
      { find: 'path', replacement: path.resolve(__dirname, 'src/utils/browser-path.ts') },
    ],
    conditions: ['browser', 'module', 'import', 'default'],
  },
  define: {
    global: 'globalThis',
    __CLIENT_PROFILE__: '"web-lite"',
  },
  optimizeDeps: {
    include: ['monaco-editor', 'buffer'],
    // Pre-bundling caches engine; exclude so dev picks up packages/engine/dist changes.
    exclude: ['@beatbax/engine'],
  },
  server: {
    watch: {
      // Junction → packages/engine; ensure tsc --watch dist/ changes trigger HMR.
      ignored: [
        '!**/node_modules/@beatbax/engine/dist/**',
        '!**/packages/engine/dist/**',
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor')) return 'monaco';
          if (id.includes('node_modules/@beatbax/engine') || id.includes(`${path.sep}packages${path.sep}engine${path.sep}`)) {
            return 'engine';
          }
        },
      },
    },
    chunkSizeWarningLimit: 5000,
  },
  worker: {
    format: 'es',
    plugins: () => [],
  },
});
