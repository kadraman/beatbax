import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  // Monaco plugin temporarily disabled - will add after basic setup works
  // plugins: [],
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
    include: ['@beatbax/engine'],
    // Exclude Node.js built-ins from optimization
    exclude: ['fs', 'path']
  },
  build: {
    rollupOptions: {
      // Keep @beatbax/engine external so we can ship it as a separate
      // ESM artifact (copied into public/engine) and avoid inlining it
      // into the demo bundle for production.
      external: ['@beatbax/engine']
    }
  }
});
