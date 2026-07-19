/**
 * HMR-safe React root helpers for nested createRoot() mounts.
 *
 * The desktop shell mounts several React trees into host divs owned by the
 * parent App tree. On Vite HMR, those hosts can be remounted or cleared while
 * a previous Root still thinks it owns the DOM — leading to:
 *   Failed to execute 'removeChild' on 'Node': The node to be removed is not a child…
 *
 * Always create roots through {@link mountReactRoot} and tear them down with
 * {@link unmountReactRoot}. Never clear a React-root host with `innerHTML = ''`
 * before unmounting.
 */
import { createRoot, type Root } from 'react-dom/client';

const roots = new WeakMap<HTMLElement, Root>();

/** Create a root on `container`, unmounting any prior root bound to it. */
export function mountReactRoot(container: HTMLElement): Root {
  const existing = roots.get(container);
  if (existing) {
    unmountReactRoot(container, existing);
  }
  const root = createRoot(container);
  roots.set(container, root);
  return root;
}

/** Idempotent unmount that tolerates hosts already wiped by HMR. */
export function unmountReactRoot(container: HTMLElement, root: Root | null | undefined): void {
  if (!root) return;
  try {
    root.unmount();
  } catch {
    // Host DOM may already have been replaced/cleared during HMR.
  }
  if (roots.get(container) === root) {
    roots.delete(container);
  }
}
