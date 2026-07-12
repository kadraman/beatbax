import type { BrowserWindow } from 'electron';
import {
  DEFAULT_NATIVE_MENU_CHECK_STATE,
  type NativeMenuCheckState,
} from '../shared/native-menu-checks';

export async function readNativeMenuCheckState(
  window: BrowserWindow,
): Promise<NativeMenuCheckState> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return { ...DEFAULT_NATIVE_MENU_CHECK_STATE };
  }

  const { webContents } = window;
  if (webContents.isLoadingMainFrame() || webContents.getURL() === '') {
    return { ...DEFAULT_NATIVE_MENU_CHECK_STATE };
  }

  try {
    const state = await webContents.executeJavaScript(
      'typeof window.__beatbax_getNativeMenuCheckState === "function"'
      + ' ? window.__beatbax_getNativeMenuCheckState() : null',
      true,
    ) as NativeMenuCheckState | null;

    if (!state || typeof state !== 'object') {
      return { ...DEFAULT_NATIVE_MENU_CHECK_STATE };
    }

    return { ...DEFAULT_NATIVE_MENU_CHECK_STATE, ...state };
  } catch {
    return { ...DEFAULT_NATIVE_MENU_CHECK_STATE };
  }
}
