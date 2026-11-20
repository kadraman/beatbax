import { Buffer } from 'buffer';
import { createRoot } from 'react-dom/client';
import { loadExporterPluginsFromStorage } from '@beatbax/app-core/plugins/exporter-registry-config';
import { loadPluginsFromStorage } from '@beatbax/app-core/plugins/registry-config';
import '@beatbax/ui-tokens/tokens.css';
import './styles.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { loadEnabledUserChipPlugins } from './plugins/user-chip-plugins';

(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

async function bootstrap(): Promise<void> {
  // Bundled catalogue first, then user plugins (spec 111 FR-013).
  // App.tsx still calls createAppContext().initializePlugins(); those loaders are idempotent.
  loadPluginsFromStorage();
  loadExporterPluginsFromStorage();
  await loadEnabledUserChipPlugins();

  const rootEl = document.getElementById('root')!;
  const root = createRoot(rootEl);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );

  // Dispose the app root on Vite HMR so nested createRoot hosts are not orphaned.
  import.meta.hot?.dispose(() => {
    try {
      root.unmount();
    } catch {
      // Host may already have been replaced during a full reload.
    }
  });
}

void bootstrap().catch((error) => {
  console.error('Desktop bootstrap failed', error);
  const rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.textContent =
      error instanceof Error ? `BeatBax failed to start: ${error.message}` : 'BeatBax failed to start.';
  }
});
