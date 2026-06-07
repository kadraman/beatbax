import type { ElectronAPI } from '../../shared/electron-api';

function getElectronApi(): ElectronAPI {
  return (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;
}

export function writeFileSync(targetPath: string, data: Uint8Array): void {
  getElectronApi().writeFileSync(targetPath, data);
}

export function readFileSync(): never {
  throw new Error('readFileSync is not available in the desktop renderer.');
}

export function existsSync(): boolean {
  return false;
}

export function mkdirSync(): void {
  // no-op in renderer
}

export function statSync(): never {
  throw new Error('statSync is not available in the desktop renderer.');
}

export default {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
};
