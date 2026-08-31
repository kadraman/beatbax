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
      alias: [
        {
          // Route all app-core imports to TypeScript sources (not stale dist/) in dev + build.
          find: /^@beatbax\/app-core(\/.*)?$/,
          replacement: `${resolve(__dirname, '../../packages/app-core/src')}$1`,
        },
        {
          find: '@',
          replacement: resolve(__dirname, 'src/renderer/src'),
        },
        {
          find: 'fs',
          replacement: resolve(__dirname, 'src/renderer/src/electron-fs.ts'),
        },
        {
          find: 'path',
          replacement: resolve(__dirname, '../web-ui/src/utils/browser-path.ts'),
        },
      ],
      // Prefer TypeScript sources over stale co-located .js emit in src/.
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
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
