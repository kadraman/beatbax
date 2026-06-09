import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** electron-vite emits preload as index.mjs when package.json type is module. */
export function resolvePreloadPath(mainDirname: string): string {
  for (const ext of ['.mjs', '.js']) {
    const candidate = join(mainDirname, `../preload/index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return join(mainDirname, '../preload/index.mjs');
}
