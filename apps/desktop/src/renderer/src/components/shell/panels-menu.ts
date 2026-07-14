/**
 * Panel visibility menu — shared definitions for the status-bar Panels dropdown.
 */

import { getClientProfile, getCurrentCapabilities } from '@beatbax/app-core/client-profile';
import {
  detectShortcutPlatform,
  formatCommandShortcut,
  type ShortcutCommandId,
} from '@beatbax/app-core/shortcuts';
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

function panelShortcut(id: ShortcutCommandId): string {
  return formatCommandShortcut(id, getClientProfile(), detectShortcutPlatform());
}

export function buildPanelMenuEntries(state: PanelMenuState): PanelMenuEntry[] {
  const caps = getCurrentCapabilities();
  const entries: PanelMenuEntry[] = [];

  if (caps.outputPanel) {
    entries.push({
      id: 'output',
      label: 'Output',
      group: 'bottom',
      shortcut: panelShortcut('view.showOutput'),
      checked: state.outputOpen && state.outputPaneVisible,
      disabled: false,
    });
  }

  if (caps.problemsPanel) {
    entries.push({
      id: 'problems',
      label: 'Problems',
      group: 'bottom',
      shortcut: panelShortcut('view.showProblems'),
      checked: state.problemsOpen && state.outputPaneVisible,
      disabled: false,
    });
  }

  if (caps.songVisualizer) {
    entries.push({
      id: 'song-visualizer',
      label: 'Visualizer',
      group: 'side',
      shortcut: panelShortcut('view.showSongVisualizer'),
      checked: state.channelsOpen && state.rightPaneVisible,
      disabled: caps.export ? !isFeatureEnabled(FeatureFlag.SONG_VISUALIZER) : false,
    });
  }

  if (caps.helpPanel) {
    entries.push({
      id: 'help',
      label: 'Help',
      group: 'side',
      shortcut: panelShortcut('help.showHelp'),
      checked: state.helpOpen && state.rightPaneVisible,
      disabled: false,
    });
  }

  if (caps.copilot) {
    entries.push({
      id: 'ai-assistant',
      label: 'Copilot',
      group: 'side',
      shortcut: panelShortcut('tools.toggleCopilot'),
      checked: state.aiOpen && state.rightPaneVisible,
      disabled: !isFeatureEnabled(FeatureFlag.AI_ASSISTANT),
    });
  }

  entries.push(
    {
      id: 'toolbar',
      label: 'Toolbar',
      group: 'window',
      shortcut: panelShortcut('view.toggleToolbar'),
      checked: state.toolbarVisible,
      disabled: false,
    },
    {
      id: 'transport-bar',
      label: 'Transport bar',
      group: 'window',
      shortcut: panelShortcut('view.toggleTransportBar'),
      checked: state.transportVisible,
      disabled: false,
    },
  );

  if (caps.channelMixer) {
    entries.push({
      id: 'channel-mixer',
      label: 'Channel mixer',
      group: 'window',
      shortcut: panelShortcut('view.toggleChannelMixer'),
      checked: state.channelMixerVisible,
      disabled: !isFeatureEnabled(FeatureFlag.CHANNEL_MIXER),
    });
  }

  if (caps.patternGrid) {
    entries.push({
      id: 'pattern-grid',
      label: 'Pattern grid',
      group: 'window',
      shortcut: panelShortcut('view.togglePatternGrid'),
      checked: state.patternGridVisible,
      disabled: !isFeatureEnabled(FeatureFlag.PATTERN_GRID),
    });
  }

  return entries;
}
