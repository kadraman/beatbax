import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      // allow imports like '@/...' if desired
      '@': path.resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    include: ['@beatbax/engine']
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
