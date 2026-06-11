import { join } from 'node:path';

/** electron-vite preload bundle (CJS index.js for sandboxed renderer compatibility). */
export function resolvePreloadPath(mainDirname: string): string {
  return join(mainDirname, '../preload/index.js');
}
