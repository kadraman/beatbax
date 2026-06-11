/// <reference types="vite/client" />

import type { ElectronAPI } from '../../shared/electron-api';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }

  const __CLIENT_PROFILE__: 'web-lite' | 'desktop-full';
}
