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
      '@beatbax/engine/song$': path.resolve(__dirname, '../../packages/engine/dist/song/index.browser.js')
    },
    // Ensure Node.js built-ins are not polyfilled (we don't need them in browser)
    conditions: ['browser', 'module', 'import', 'default']
  },
  optimizeDeps: {
    include: ['monaco-editor'],
    // Exclude @beatbax/engine so Vite always uses the built dist files directly
    // without pre-bundling/caching them (important for local development)
    exclude: ['fs', 'path', '@beatbax/engine']
  },
  build: {
    rollupOptions: {
      // Keep @beatbax/engine external so we can ship it as a separate
      // ESM artifact (copied into public/engine) and avoid inlining it
      // into the demo bundle for production.
      external: ['@beatbax/engine'],
      // Ensure additional HTML entry pages are included in the build output
      // so files like index-phase1.html and index-phase2.html end up in dist/.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        phase1: path.resolve(__dirname, 'index-phase1.html'),
        phase2: path.resolve(__dirname, 'index-phase2.html')
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
