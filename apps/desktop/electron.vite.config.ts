import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const webUiRoot = resolve(__dirname, '../web-ui');

function resolveGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
}

const gitCommit = resolveGitCommit();

export default defineConfig({
  main: {},
  preload: {
    build: {
      externalizeDeps: false,
      // @ts-expect-error vite 7 typings omit rollupOptions from BuildEnvironmentOptions
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.js',
        },
      },
    },
  },
  renderer: {
    base: './',
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
      __BEATBAX_GIT_COMMIT__: JSON.stringify(gitCommit),
    },
    publicDir: resolve(webUiRoot, 'public'),
    optimizeDeps: {
      include: ['monaco-editor', 'buffer', 'marked', 'dompurify'],
      exclude: ['@beatbax/engine', '@beatbax/plugin-chip-sms'],
    },
    plugins: [react(), tailwindcss()],
  },
});
