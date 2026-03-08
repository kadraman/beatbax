/**
 * UI subsystem exports
 */

export { createLayout, createThreePaneLayout, createOutputPanelContent } from './layout';
export type { LayoutConfig, LayoutManager, ThreePaneLayoutManager } from './layout';

export { StatusBar } from './status-bar';
export type { StatusBarConfig, StatusInfo } from './status-bar';

export { ThemeManager } from './theme-manager';
export type { Theme, ThemeManagerOptions } from './theme-manager';

export { MenuBar } from './menu-bar';
export type { MenuBarOptions } from './menu-bar';
