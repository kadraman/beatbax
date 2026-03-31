import { defineConfig } from 'vite';
import path from 'path';

// Note: To enable Monaco Editor workers without CORS issues,
// install vite-plugin-monaco-editor: npm install -D vite-plugin-monaco-editor
// Then uncomment the import and plugin configuration below.
//
// import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  // Uncomment the plugins section once vite-plugin-monaco-editor is installed
  /*
  plugins: [
    monacoEditorPlugin({
      // Only bundle workers we need (reduces bundle size)
      languageWorkers: ['json', 'typescript'],
      // Custom workers for BeatBax language
      customWorkers: [
        {
          label: 'beatbax',
          entry: 'monaco-editor/esm/vs/language/typescript/ts.worker',
        },
      ],
    }),
  ],
  */
  root: '.',
  resolve: {
    alias: {
      // allow imports like '@/...' if desired
      '@': path.resolve(__dirname, 'src'),
      // Force browser-safe import resolver in browser builds (exact match only)
      '@beatbax/engine/song$': path.resolve(
        __dirname,
        '../../packages/engine/dist/song/index.browser.js'
      ),
      // Redirect Node.js 'fs' to a browser-safe mock so the engine's
      // UGE/MIDI exporters can run in the browser via writeFileSync capture.
      'fs': path.resolve(__dirname, 'src/utils/browser-fs.ts'),
    },
    // Ensure Node.js built-ins are not polyfilled (we don't need them in browser)
    conditions: ['browser', 'module', 'import', 'default']
  },
  // Make 'Buffer' and 'global' available globally for the engine
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: [
      'monaco-editor',
      // Pre-bundle 'buffer' polyfill so it's available as an ESM module
      'buffer',
    ],
    // Exclude @beatbax/engine so Vite always uses the built dist files directly
    // without pre-bundling/caching them (important for local development)
    exclude: ['path', '@beatbax/engine']
  },
  build: {
    rollupOptions: {
      // Keep @beatbax/engine external so we can ship it as a separate
      // ESM artifact (copied into public/engine) and avoid inlining it
      // into the demo bundle for production.
      external: ['@beatbax/engine'],
      input: {
        main: path.resolve(__dirname, 'index.html'),
      }
    },
    // Increase chunk size warning limit for Monaco Editor
    chunkSizeWarningLimit: 2000
  },
  // Worker configuration for Monaco Editor
  worker: {
    format: 'es',
    plugins: []
  }
});
