import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import type { buildBottomTabs, buildRightTabs } from '@web-ui/app/tabs';
import type { buildShortcutsModal } from '@web-ui/app/modals';
import type { buildSettingsModal } from '@web-ui/panels/settings-panel';
import type { ChannelMixer } from '@web-ui/panels/channel-mixer';
import type { ThemeManager } from '@web-ui/ui/theme-manager';
import type { TransportBar } from '@web-ui/ui/transport-bar';
import { KeyboardShortcuts } from '@web-ui/utils/keyboard-shortcuts';
import type { DesktopCopilotHandle } from './desktop-copilot';

type BottomTabs = ReturnType<typeof buildBottomTabs>;
type RightTabs = ReturnType<typeof buildRightTabs>;
type SettingsModal = ReturnType<typeof buildSettingsModal>;
type ShortcutsModal = ReturnType<typeof buildShortcutsModal>;

export interface RegisterDesktopShortcutsOptions {
  ks: KeyboardShortcuts;
  eventBus: EventBus;
  getEditor: () => BeatBaxEditor | null;
  transportBar: TransportBar;
  bottomTabs: BottomTabs;
  rightTabs: RightTabs;
  settingsModal: SettingsModal;
  shortcutsModal: ShortcutsModal;
  runParse: (content: string) => void;
  getSource: () => string;
  onNew: () => void;
  onOpen: () => void | Promise<void>;
  onSave: (saveAs?: boolean) => void | Promise<void>;
  themeManager: ThemeManager;
  channelMixer: ChannelMixer | null;
  copilot: DesktopCopilotHandle | null;
}

export function registerDesktopShortcuts(opts: RegisterDesktopShortcutsOptions): void {
  const {
    ks, eventBus, getEditor, transportBar, bottomTabs, rightTabs,
    settingsModal, shortcutsModal, runParse, getSource,
    onNew, onOpen, onSave, themeManager, channelMixer, copilot,
  } = opts;

  const monacoInst = () => getEditor()?.editor;

  ks.register({ key: ' ', description: 'Play / Pause (when editor not focused)', allowInInput: false,
    action: () => {
      if (!transportBar.playButton.disabled) transportBar.playButton.click();
      else transportBar.pauseButton.click();
    },
  });
  ks.register({ key: 'F5', description: 'Play / re-play', allowInInput: false,
    action: () => transportBar.playButton.click(),
  });
  ks.register({ key: 'F8', description: 'Stop playback', allowInInput: false,
    action: () => transportBar.stopButton.click(),
  });
  ks.register({ key: 'Escape', description: 'Stop playback (when editor not focused)', allowInInput: false,
    action: () => transportBar.stopButton.click(),
  });
  ks.register({ key: 'Enter', ctrlKey: true, description: 'Apply & re-play', allowInInput: false,
    action: () => transportBar.applyButton.click(),
  });

  ks.register({ key: 'o', ctrlKey: true, description: 'Open file…', allowInInput: true,
    action: () => { void onOpen(); },
  });
  ks.register({ key: 's', ctrlKey: true, description: 'Save', allowInInput: true,
    action: () => { void onSave(false); },
  });
  ks.register({ key: 's', ctrlKey: true, shiftKey: true, description: 'Save as…', allowInInput: true,
    action: () => { void onSave(true); },
  });
  ks.register({ key: 'n', ctrlKey: true, description: 'New song', allowInInput: true,
    action: () => onNew(),
  });

  ks.register({ key: 'z', ctrlKey: true, description: 'Undo', allowInInput: false,
    action: () => monacoInst()?.trigger('menu', 'undo', null),
  });
  ks.register({ key: 'y', ctrlKey: true, description: 'Redo', allowInInput: false,
    action: () => monacoInst()?.trigger('menu', 'redo', null),
  });

  ks.register({ key: 'l', altKey: true, shiftKey: true, description: 'Theme (Dark / Light)', allowInInput: true,
    action: () => themeManager.toggle(),
  });
  ks.register({ key: '`', ctrlKey: true, description: 'Show Output panel', allowInInput: true,
    action: () => bottomTabs.show('output'),
  });
  ks.register({ key: 'p', altKey: true, shiftKey: true, description: 'Show Problems panel', allowInInput: true,
    action: () => bottomTabs.show('problems'),
  });
  ks.register({ key: 'v', ctrlKey: true, shiftKey: true, description: 'Show Song Visualizer', allowInInput: true,
    action: () => rightTabs.show('channels'),
  });
  ks.register({ key: 'm', ctrlKey: true, shiftKey: true, description: 'Toggle Channel Mixer', allowInInput: true,
    action: () => {
      if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
      const vis = channelMixer?.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
    },
  });

  ks.register({ key: 'F1', shiftKey: true, description: 'Show Help tab', allowInInput: true,
    action: () => rightTabs.show('help'),
  });
  ks.register({ key: 'k', altKey: true, shiftKey: true, description: 'Show Keyboard Shortcuts', allowInInput: true,
    action: () => shortcutsModal.open(),
  });
  ks.register({ key: ',', ctrlKey: true, description: 'Open Settings', allowInInput: true,
    action: () => settingsModal.open(),
  });
  ks.register({ key: 'v', altKey: true, shiftKey: true, description: 'Verify syntax', allowInInput: true,
    action: () => runParse(getSource()),
  });
  ks.register({ key: 'p', ctrlKey: true, altKey: true, description: 'Open Command Palette', allowInInput: true,
    action: () => {
      const ed = monacoInst();
      if (!ed) return;
      ed.focus();
      window.setTimeout(() => ed.trigger('', 'editor.action.quickCommand', null), 50);
    },
  });
  if (copilot) {
    ks.register({ key: 'i', ctrlKey: true, shiftKey: true, description: 'Toggle AI Copilot', allowInInput: true,
      action: () => copilot.toggle(),
    });
  }
}
