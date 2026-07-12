import type { MenuAction } from './electron-api';

/** Checkable View menu actions shown in the macOS native menu. */
export type NativeMenuCheckAction =
  | 'view:toggle-output'
  | 'view:toggle-problems'
  | 'view:toggle-toolbar'
  | 'view:toggle-transport-bar'
  | 'view:toggle-channel-mixer'
  | 'view:toggle-song-visualizer'
  | 'view:toggle-pattern-grid'
  | 'view:toggle-ai-assistant'
  | 'view:toggle-wrap-text'
  | 'view:toggle-fold-all';

export interface NativeMenuToggleState {
  checked: boolean;
  enabled?: boolean;
}

export type NativeMenuCheckState = Record<NativeMenuCheckAction, NativeMenuToggleState>;

export const DEFAULT_NATIVE_MENU_CHECK_STATE: NativeMenuCheckState = {
  'view:toggle-output': { checked: false },
  'view:toggle-problems': { checked: true },
  'view:toggle-toolbar': { checked: true },
  'view:toggle-transport-bar': { checked: true },
  'view:toggle-channel-mixer': { checked: false },
  'view:toggle-song-visualizer': { checked: false },
  'view:toggle-pattern-grid': { checked: false },
  'view:toggle-ai-assistant': { checked: false },
  'view:toggle-wrap-text': { checked: false },
  'view:toggle-fold-all': { checked: false },
};

export function isNativeMenuCheckAction(action: MenuAction): action is NativeMenuCheckAction {
  return action in DEFAULT_NATIVE_MENU_CHECK_STATE;
}
