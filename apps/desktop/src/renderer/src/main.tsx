import { Buffer } from 'buffer';
import { createRoot } from 'react-dom/client';
import '@web-ui/styles.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
