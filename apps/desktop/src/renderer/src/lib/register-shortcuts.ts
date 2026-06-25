import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import type { buildBottomTabs, buildRightTabs } from '../desktop-web-ui/app/tabs';
import type { buildShortcutsModal } from '../desktop-web-ui/app/modals';
import type { ThemeManager } from '../desktop-web-ui/ui/theme-manager';
import { KeyboardShortcuts } from '../utils/keyboard-shortcuts';
import type { DesktopCopilotHandle } from './desktop-copilot';
import type { DesktopSettingsModalHandle } from '../components/panels/DesktopSettingsModal';
import type { DesktopChannelMixerHandle } from '../components/panels/DesktopChannelMixer';
import type { DesktopToolbarHandle } from '../components/workspace/DesktopToolbar';
import type { DesktopTransportBarHandle } from '../components/workspace/DesktopTransportBar';

type BottomTabs = ReturnType<typeof buildBottomTabs>;
type RightTabs = ReturnType<typeof buildRightTabs>;
type ShortcutsModal = ReturnType<typeof buildShortcutsModal>;

export interface RegisterDesktopShortcutsOptions {
  ks: KeyboardShortcuts;
  eventBus: EventBus;
  getEditor: () => BeatBaxEditor | null;
  transportBar: DesktopTransportBarHandle;
  toolbar: DesktopToolbarHandle;
  bottomTabs: BottomTabs;
  rightTabs: RightTabs;
  settingsModal: DesktopSettingsModalHandle;
  shortcutsModal: ShortcutsModal;
  runParse: (content: string) => void;
  getSource: () => string;
  onNew: () => void;
  onOpen: () => void | Promise<void>;
  onSave: (saveAs?: boolean) => void | Promise<void>;
  themeManager: ThemeManager;
  channelMixer: DesktopChannelMixerHandle | null;
  copilot: DesktopCopilotHandle | null;
}

/**
 * Desktop-global shortcuts. Unlike the browser client, standard file shortcuts
 * (Ctrl+N/O/S) are available here. Editor-focused transport keys (F5/F8,
 * Ctrl+Enter) are duplicated in setupDesktopMonacoShortcuts().
 */
export function registerDesktopShortcuts(opts: RegisterDesktopShortcutsOptions): void {
  const {
    ks, eventBus, getEditor, transportBar, toolbar, bottomTabs, rightTabs,
    settingsModal, shortcutsModal, runParse, getSource,
    onNew, onOpen, onSave, themeManager, channelMixer, copilot,
  } = opts;

  const monacoInst = () => getEditor()?.editor;

  // ── Transport ─────────────────────────────────────────────────────────────
  ks.register({ key: 'F5', description: 'Play / re-play', allowInInput: false,
    action: () => transportBar.playButton.click(),
  });
  ks.register({ key: 'F8', description: 'Stop playback', allowInInput: false,
    action: () => transportBar.stopButton.click(),
  });
  ks.register({ key: 'Enter', ctrlKey: true, description: 'Apply & re-play', allowInInput: false,
    action: () => transportBar.applyButton.click(),
  });

  // ── File (native desktop — not browser-limited) ───────────────────────────
  ks.register({ key: 'n', ctrlKey: true, description: 'New song', allowInInput: true,
    action: () => onNew(),
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

  // ── Edit (global fallback when Monaco is not focused) ─────────────────────
  ks.register({ key: 'z', ctrlKey: true, description: 'Undo', allowInInput: false,
    action: () => monacoInst()?.trigger('menu', 'undo', null),
  });
  ks.register({ key: 'y', ctrlKey: true, description: 'Redo', allowInInput: false,
    action: () => monacoInst()?.trigger('menu', 'redo', null),
  });
  ks.register({ key: 'z', ctrlKey: true, shiftKey: true, description: 'Redo', allowInInput: false,
    action: () => monacoInst()?.trigger('menu', 'redo', null),
  });

  // Monaco-only note edits — listed for the shortcuts help panel.
  ks.register({ key: '.', altKey: true, description: 'Note: semitone up (editor)', allowInInput: false, action: () => {} });
  ks.register({ key: ',', altKey: true, description: 'Note: semitone down (editor)', allowInInput: false, action: () => {} });
  ks.register({ key: '.', altKey: true, shiftKey: true, description: 'Note: octave up (editor)', allowInInput: false, action: () => {} });
  ks.register({ key: ',', altKey: true, shiftKey: true, description: 'Note: octave down (editor)', allowInInput: false, action: () => {} });

  // ── View ──────────────────────────────────────────────────────────────────
  ks.register({ key: 'l', ctrlKey: true, shiftKey: true, description: 'Theme (Dark / Light)', allowInInput: true,
    action: () => themeManager.toggle(),
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
  ks.register({ key: 'b', altKey: true, shiftKey: true, description: 'Toggle Toolbar', allowInInput: true,
    action: () => {
      const vis = toolbar.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'toolbar', visible: !vis });
    },
  });
  ks.register({ key: 'r', altKey: true, shiftKey: true, description: 'Toggle Transport Bar', allowInInput: true,
    action: () => {
      const vis = transportBar.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: !vis });
    },
  });

  // ── Help / tools ──────────────────────────────────────────────────────────
  ks.register({ key: 'F1', shiftKey: true, description: 'Show Help tab', allowInInput: true,
    action: () => rightTabs.show('help'),
  });
  ks.register({ key: 'h', altKey: true, shiftKey: true, description: 'Show Help tab', allowInInput: true,
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
    ks.register({ key: 'i', altKey: true, shiftKey: true, description: 'Toggle AI Copilot', allowInInput: true,
      action: () => copilot.toggle(),
    });
  }
}
