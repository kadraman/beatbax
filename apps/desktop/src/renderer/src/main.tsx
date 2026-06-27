import { Buffer } from 'buffer';
import { createRoot } from 'react-dom/client';
import '@beatbax/ui-tokens/tokens.css';
import './styles.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
