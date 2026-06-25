import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import { settingFeatureAI } from '@beatbax/app-core/stores/settings.store';
import { useStoreValue } from '../../hooks/useStoreValue';
import { GeneralSettingsSection, resetGeneralDefaults } from '../settings/general';
import { EditorSettingsSection, resetEditorDefaults } from '../settings/editor';
import { PlaybackSettingsSection, resetPlaybackDefaults } from '../settings/playback';
import { FeaturesSettingsSection, resetFeaturesDefaults } from '../settings/features';
import { PluginsSettingsSection, resetPluginsDefaults } from '../settings/plugins';
import { AISettingsSection, resetAIDefaults } from '../settings/ai';
import { AdvancedSettingsSection, resetAdvancedDefaults } from '../settings/advanced';

export type DesktopSettingsSectionId = 'general' | 'editor' | 'playback' | 'features' | 'plugins' | 'ai' | 'advanced';

export interface DesktopSettingsModalHandle {
  open: (section?: DesktopSettingsSectionId) => void;
  close: () => void;
  refresh: () => void;
  dispose: () => void;
}

export const noopDesktopSettingsModal: DesktopSettingsModalHandle = {
  open: () => undefined,
  close: () => undefined,
  refresh: () => undefined,
  dispose: () => undefined,
};

interface DesktopSettingsModalOptions {
  onClose?: () => void;
}

interface DesktopSettingsModalProps extends DesktopSettingsModalOptions {
  modalRef: Ref<DesktopSettingsModalHandle>;
}

interface SectionDef {
  id: DesktopSettingsSectionId;
  label: string;
  icon: string;
  Component: ComponentType;
  reset: () => void;
  visible?: () => boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'general', label: 'General', icon: '⚙', Component: GeneralSettingsSection, reset: resetGeneralDefaults },
  { id: 'editor', label: 'Editor', icon: '✏', Component: EditorSettingsSection, reset: resetEditorDefaults },
  { id: 'playback', label: 'Playback', icon: '▶', Component: PlaybackSettingsSection, reset: resetPlaybackDefaults },
  { id: 'features', label: 'Features', icon: '⬡', Component: FeaturesSettingsSection, reset: resetFeaturesDefaults },
  { id: 'plugins', label: 'Plugins', icon: '🔌', Component: PluginsSettingsSection, reset: resetPluginsDefaults },
  {
    id: 'ai',
    label: 'AI Copilot',
    icon: '✦',
    Component: AISettingsSection,
    reset: resetAIDefaults,
    visible: () => isFeatureEnabled(FeatureFlag.AI_ASSISTANT),
  },
  { id: 'advanced', label: 'Advanced', icon: '⋮', Component: AdvancedSettingsSection, reset: resetAdvancedDefaults },
];

function DesktopSettingsModal({ modalRef, onClose }: DesktopSettingsModalProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<DesktopSettingsSectionId>('general');
  const [refreshToken, setRefreshToken] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const aiFeatureEnabled = useStoreValue(settingFeatureAI);

  const visibleSections = useMemo(() => {
    return SECTIONS.filter((section) => {
      if (section.id === 'ai') return aiFeatureEnabled || section.visible?.();
      return !section.visible || section.visible();
    });
  }, [aiFeatureEnabled, refreshToken]);

  const activeDef = visibleSections.find((section) => section.id === activeSection) ?? visibleSections[0] ?? SECTIONS[0];
  const ActiveSection = activeDef.Component;

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useImperativeHandle(modalRef, () => ({
    open: (section) => {
      refresh();
      if (section) setActiveSection(section);
      setOpen(true);
      window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    },
    close,
    refresh,
    dispose: () => undefined,
  }), [close, refresh]);

  useLayoutEffect(() => {
    if (!visibleSections.some((section) => section.id === activeSection)) {
      setActiveSection(visibleSections[0]?.id ?? 'general');
    }
  }, [activeSection, visibleSections]);

  const resetActive = () => {
    activeDef.reset();
    setRefreshToken((token) => token + 1);
  };

  const onBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      aria-label="Settings"
      aria-modal="true"
      className={`bb-settings-backdrop${open ? ' bb-settings-backdrop--open' : ''}`}
      onClick={onBackdropClick}
      onKeyDown={onKeyDown}
      role="dialog"
    >
      <div className="bb-settings-modal">
        <div className="bb-settings-modal-header">
          <span className="bb-settings-modal-title">Settings</span>
          <span className="bb-settings-modal-hint">Ctrl+,</span>
          <button
            aria-label="Close Settings"
            className="bb-settings-modal-close"
            onClick={close}
            ref={closeButtonRef}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="bb-settings-modal-body">
          <nav aria-label="Settings sections" className="bb-settings-sidebar" role="tablist">
            {visibleSections.map((section) => (
              <button
                aria-controls={`bb-settings-panel-${section.id}`}
                aria-selected={section.id === activeDef.id}
                className={`bb-settings-nav-btn${section.id === activeDef.id ? ' bb-settings-nav-btn--active' : ''}`}
                data-section-id={section.id}
                id={`bb-settings-tab-${section.id}`}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                role="tab"
                type="button"
              >
                <span aria-hidden="true" className="bb-settings-nav-icon">{section.icon}</span>
                <span className="bb-settings-nav-label">{section.label}</span>
              </button>
            ))}
          </nav>
          <div
            aria-labelledby={`bb-settings-tab-${activeDef.id}`}
            className="bb-settings-content"
            id={`bb-settings-panel-${activeDef.id}`}
            role="tabpanel"
          >
            <ActiveSection key={`${activeDef.id}-${refreshToken}`} />
          </div>
        </div>

        <div className="bb-settings-modal-footer">
          <button className="bb-settings-btn-secondary" onClick={resetActive} type="button">
            Reset to defaults
          </button>
          <button className="bb-settings-btn-primary" onClick={close} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function createDesktopSettingsModal(options?: DesktopSettingsModalOptions): DesktopSettingsModalHandle {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handleRef = { current: null as DesktopSettingsModalHandle | null };
  let root: Root | null = createRoot(host);

  flushSync(() => {
    root?.render(
      <DesktopSettingsModal
        {...options}
        modalRef={(handle) => {
          handleRef.current = handle;
        }}
      />,
    );
  });

  const call = (fn: (handle: DesktopSettingsModalHandle) => void) => {
    if (handleRef.current) fn(handleRef.current);
  };

  return {
    open: (section) => call((handle) => handle.open(section)),
    close: () => call((handle) => handle.close()),
    refresh: () => call((handle) => handle.refresh()),
    dispose: () => {
      handleRef.current?.dispose();
      if (root) {
        root.unmount();
        root = null;
      }
      host.remove();
    },
  };
}
