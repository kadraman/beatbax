import { defineConfig } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  root: '.',
  resolve: {
    alias: [
      // allow imports like '@/...' if desired
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // Redirect Node.js 'fs' to a browser-safe mock so the engine's
      // UGE/MIDI exporters can run in the browser via writeFileSync capture.
      { find: 'fs', replacement: path.resolve(__dirname, 'src/utils/browser-fs.ts') },
    ],
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
      // Keep engine imports external so production uses /engine/* assets copied
      // by prepare-engine and resolved via import map in index.html.
      external: [/^@beatbax\/engine(?:\/.*)?$/],
      input: {
        main: path.resolve(__dirname, 'index.html'),
      }
    },
    // Increase chunk size warning limit for Monaco Editor
    chunkSizeWarningLimit: 5000
  },
  // Worker configuration for Monaco Editor
  worker: {
    format: 'es',
    plugins: () => []
  }
});
