import { useSyncExternalStore } from 'react';

interface ReadableStore<T> {
  get(): T;
  subscribe(callback: (value: T) => void): () => void;
}

export function useStoreValue<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(
    (callback) => store.subscribe(() => callback()),
    () => store.get(),
    () => store.get(),
  );
}
