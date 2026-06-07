/**
 * Panel visibility menu — shared definitions for the status-bar Panels dropdown.
 */

import { getCurrentCapabilities } from '@beatbax/app-core/client-profile';
import { FeatureFlag, isFeatureEnabled } from '@beatbax/app-core/utils/feature-flags';

export type PanelMenuId =
  | 'output'
  | 'problems'
  | 'song-visualizer'
  | 'help'
  | 'toolbar'
  | 'transport-bar'
  | 'channel-mixer'
  | 'pattern-grid'
  | 'ai-assistant';

export type PanelMenuGroup = 'bottom' | 'side' | 'window';

export interface PanelMenuEntry {
  id: PanelMenuId;
  label: string;
  group: PanelMenuGroup;
  shortcut?: string;
  checked: boolean;
  disabled: boolean;
}

/** Live panel visibility snapshot (built by main.ts on each menu open). */
export interface PanelMenuState {
  outputOpen: boolean;
  problemsOpen: boolean;
  outputPaneVisible: boolean;
  channelsOpen: boolean;
  helpOpen: boolean;
  rightPaneVisible: boolean;
  toolbarVisible: boolean;
  transportVisible: boolean;
  channelMixerVisible: boolean;
  patternGridVisible: boolean;
  aiOpen: boolean;
}

export const PANEL_MENU_GROUP_LABELS: Record<PanelMenuGroup, string> = {
  bottom: 'Bottom',
  side:   'Side',
  window: 'Window',
};

export const PANEL_MENU_GROUP_ORDER: PanelMenuGroup[] = ['bottom', 'side', 'window'];

export function buildPanelMenuEntries(state: PanelMenuState): PanelMenuEntry[] {
  const caps = getCurrentCapabilities();
  const entries: PanelMenuEntry[] = [];

  if (caps.outputPanel) {
    entries.push({
      id: 'output',
      label: 'Output',
      group: 'bottom',
      shortcut: 'Ctrl+`',
      checked: state.outputOpen && state.outputPaneVisible,
      disabled: false,
    });
  }

  if (caps.problemsPanel) {
    entries.push({
      id: 'problems',
      label: 'Problems',
      group: 'bottom',
      shortcut: 'Alt+Shift+P',
      checked: state.problemsOpen && state.outputPaneVisible,
      disabled: false,
    });
  }

  entries.push({
    id: 'song-visualizer',
    label: 'Visualizer',
    group: 'side',
    shortcut: 'Ctrl+Shift+V',
    checked: state.channelsOpen && state.rightPaneVisible,
    disabled: caps.export ? !isFeatureEnabled(FeatureFlag.SONG_VISUALIZER) : false,
  });

  if (caps.helpPanel) {
    entries.push({
      id: 'help',
      label: 'Help',
      group: 'side',
      shortcut: 'Shift+F1',
      checked: state.helpOpen && state.rightPaneVisible,
      disabled: false,
    });
  }

  if (caps.copilot) {
    entries.push({
      id: 'ai-assistant',
      label: 'Copilot',
      group: 'side',
      shortcut: 'Alt+Shift+I',
      checked: state.aiOpen && state.rightPaneVisible,
      disabled: !isFeatureEnabled(FeatureFlag.AI_ASSISTANT),
    });
  }

  entries.push(
    {
      id: 'toolbar',
      label: 'Toolbar',
      group: 'window',
      shortcut: 'Alt+Shift+B',
      checked: state.toolbarVisible,
      disabled: false,
    },
    {
      id: 'transport-bar',
      label: 'Transport bar',
      group: 'window',
      shortcut: 'Alt+Shift+R',
      checked: state.transportVisible,
      disabled: false,
    },
  );

  if (caps.channelMixer) {
    entries.push({
      id: 'channel-mixer',
      label: 'Channel mixer',
      group: 'window',
      shortcut: 'Ctrl+Shift+M',
      checked: state.channelMixerVisible,
      disabled: !isFeatureEnabled(FeatureFlag.CHANNEL_MIXER),
    });
  }

  if (caps.patternGrid) {
    entries.push({
      id: 'pattern-grid',
      label: 'Pattern grid',
      group: 'window',
      shortcut: 'Ctrl+Shift+G',
      checked: state.patternGridVisible,
      disabled: !isFeatureEnabled(FeatureFlag.PATTERN_GRID),
    });
  }

  return entries;
}
