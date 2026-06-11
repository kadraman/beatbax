import type { ElectronAPI } from '../../shared/electron-api';

function getElectronApi(): ElectronAPI {
  return (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;
}

export function writeFileSync(targetPath: string, data: Uint8Array): void {
  getElectronApi().writeFileSync(targetPath, data);
}

export function readFileSync(targetPath: string, encoding?: BufferEncoding | string): string {
  return getElectronApi().readFileSync(targetPath, typeof encoding === 'string' ? encoding : 'utf-8');
}

export function existsSync(targetPath: string): boolean {
  return getElectronApi().existsSync(targetPath);
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
