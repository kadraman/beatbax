import { Buffer } from 'buffer';
import { createRoot } from 'react-dom/client';
import '@beatbax/ui-tokens/tokens.css';
import './styles.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

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
