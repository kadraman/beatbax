import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { ExportFormat } from '@beatbax/app-core/export/export-manager';
import { getCurrentCapabilities } from '@beatbax/app-core/client-profile';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { exporterRegistry } from '@beatbax/app-core/plugins/browser-exporter-registry';
import { icon } from '../../utils/icons';

export type DesktopToolbarStyle = 'icons+labels' | 'icons';

export interface DesktopToolbarHandle {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isVisible: () => boolean;
  dispose: () => void;
  setChip: (chip: string) => void;
  setExportEnabled: (enabled: boolean) => void;
  setThemeIcon: (theme: 'dark' | 'light') => void;
  setStyle: (style: DesktopToolbarStyle) => void;
  setWrapActive: (wrap: boolean) => void;
  setFoldCommentsActive: (folded: boolean) => void;
  setStatus: (message: string, type?: 'info' | 'success' | 'error' | '') => void;
}

export interface DesktopToolbarOptions {
  eventBus: EventBus;
  onBeforeOpenFile?: () => void;
  onLoad: (filename: string, content: string) => void;
  onOpen?: () => void | Promise<void>;
  onExport: (format: ExportFormat) => void;
  onVerify?: () => void;
  onNew?: () => void;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleTheme?: () => void;
  onToggleWrap?: (enabled: boolean) => void;
  onToggleFoldComments?: () => void;
}

interface DesktopToolbarProps extends DesktopToolbarOptions {
  toolbarRef: Ref<DesktopToolbarHandle>;
}

const EXPORTER_DEFAULT_LABELS: Record<string, string> = {
  json: 'JSON',
  midi: 'MIDI',
  wav: 'WAV',
  uge: 'UGE',
  vgm: 'VGM',
};

const EXPORTER_DEFAULT_ICONS: Record<string, string> = {
  json: 'document',
  midi: 'musical-note',
  wav: 'speaker-wave',
  uge: 'cpu-chip',
  vgm: 'cpu-chip',
};

const ICON_CLASS = 'w-4 h-4 inline-block align-text-bottom';

function ToolbarIcon({ name }: { name: string }): React.JSX.Element {
  return <span dangerouslySetInnerHTML={{ __html: icon(name, ICON_CLASS) }} />;
}

function resolveUiChipId(chip: string): string {
  return chip.trim().toLowerCase() || 'gameboy';
}

function DesktopToolbar({
  eventBus,
  onBeforeOpenFile,
  onExport,
  onLoad,
  onOpen,
  onNew,
  onRedo,
  onSave,
  onToggleFoldComments,
  onToggleTheme,
  onToggleWrap,
  onUndo,
  onVerify,
  toolbarRef,
}: DesktopToolbarProps): React.JSX.Element {
  const [visible, setVisible] = useState(true);
  const [activeChip, setActiveChip] = useState('gameboy');
  const [exportEnabled, setExportEnabled] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [toolbarStyle, setToolbarStyle] = useState<DesktopToolbarStyle>(() =>
    storage.get(StorageKey.TOOLBAR_STYLE, 'icons+labels') as DesktopToolbarStyle,
  );
  const [wrapActive, setWrapActive] = useState(false);
  const [foldActive, setFoldActive] = useState(false);
  const [status, setStatusState] = useState<{ message: string; type: 'info' | 'success' | 'error' | '' }>({
    message: '',
    type: '',
  });
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const exporters = useMemo(() => exporterRegistry.all().slice().sort((a, b) => {
    const aUniversal = a.supportedChips.includes('*');
    const bUniversal = b.supportedChips.includes('*');
    if (aUniversal !== bUniversal) return aUniversal ? -1 : 1;
    return a.id.localeCompare(b.id);
  }), []);

  const setStatus = useCallback((message: string, type: 'info' | 'success' | 'error' | '' = '') => {
    setStatusState({ message, type });
    if (type === 'success' || type === 'info') {
      window.setTimeout(() => {
        setStatusState((current) => current.message === message ? { message: '', type: '' } : current);
      }, 3000);
    }
  }, []);

  useImperativeHandle(toolbarRef, () => ({
    show: () => setVisible(true),
    hide: () => setVisible(false),
    toggle: () => setVisible((value) => !value),
    isVisible: () => visibleRef.current,
    dispose: () => undefined,
    setChip: (chip) => setActiveChip(resolveUiChipId(chip)),
    setExportEnabled,
    setThemeIcon: setTheme,
    setStyle: setToolbarStyle,
    setWrapActive,
    setFoldCommentsActive: setFoldActive,
    setStatus,
  }), [setStatus]);

  useEffect(() => {
    const cleanups = [
      eventBus.on('export:started', ({ format }) => setStatus(`Exporting ${format?.toUpperCase() ?? ''}...`, 'info')),
      eventBus.on('export:success', ({ filename, format }) => setStatus(`Exported ${filename ?? format}`, 'success')),
      eventBus.on('export:cancelled', ({ format }) => setStatus(`${format?.toUpperCase() ?? 'Export'} export cancelled`, 'info')),
      eventBus.on('export:error', ({ error }) => setStatus(`Export failed: ${error?.message ?? 'Unknown error'}`, 'error')),
    ];
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [eventBus, setStatus]);

  const caps = getCurrentCapabilities();
  const openFile = () => {
    onBeforeOpenFile?.();
    if (onOpen) {
      void onOpen();
      return;
    }
    onLoad('untitled.bax', '');
  };

  const verify = () => {
    setStatus('Verifying...', 'info');
    onVerify?.();
  };

  return (
    <div className="bb-toolbar" data-style={toolbarStyle} style={{ display: visible ? undefined : 'none' }}>
      <div className="bb-toolbar__group bb-toolbar__group--file">
        <button className="bb-toolbar__btn bb-toolbar__btn--icon bb-toolbar__item--pri-new" id="tb-new" onClick={onNew} title="New song (Ctrl+N)" type="button">
          <ToolbarIcon name="document-plus" />
          <span className="bb-toolbar__btn-label">New</span>
        </button>
        <button className="bb-toolbar__btn bb-toolbar__btn--icon bb-toolbar__item--pri-save" id="tb-save" onClick={onSave} title="Save .bax file (Ctrl+S)" type="button">
          <ToolbarIcon name="document-check" />
          <span className="bb-toolbar__btn-label">Save</span>
        </button>
        <button className="bb-toolbar__btn bb-toolbar__btn--icon bb-toolbar__item--pri-open" id="tb-open" onClick={openFile} title="Open .bax file (Ctrl+O)" type="button">
          <ToolbarIcon name="folder-open" />
          <span className="bb-toolbar__btn-label">Open</span>
        </button>
      </div>

      <div className="bb-toolbar__separator bb-toolbar__sep--edit" aria-hidden="true" />

      <div className="bb-toolbar__group bb-toolbar__group--edit">
        <button className="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-undo" onClick={onUndo} title="Undo (Ctrl+Z)" type="button">
          <ToolbarIcon name="arrow-uturn-left" />
          <span className="bb-toolbar__btn-label">Undo</span>
        </button>
        <button className="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-redo" onClick={onRedo} title="Redo (Ctrl+Y)" type="button">
          <ToolbarIcon name="arrow-uturn-right" />
          <span className="bb-toolbar__btn-label">Redo</span>
        </button>
        <button
          className={`bb-toolbar__btn bb-toolbar__btn--icon${wrapActive ? ' bb-toolbar__btn--active' : ''}`}
          id="tb-wrap"
          onClick={() => {
            const next = !wrapActive;
            setWrapActive(next);
            onToggleWrap?.(next);
          }}
          title="Toggle word wrap"
          type="button"
        >
          <ToolbarIcon name="arrow-path" />
          <span className="bb-toolbar__btn-label">Wrap</span>
        </button>
        <button
          className={`bb-toolbar__btn bb-toolbar__btn--icon${foldActive ? ' bb-toolbar__btn--active' : ''}`}
          id="tb-fold-comments"
          onClick={onToggleFoldComments}
          title={foldActive ? 'Unfold All Comments' : 'Fold All Comments'}
          type="button"
        >
          <ToolbarIcon name={foldActive ? 'chevron-up' : 'chevron-down'} />
          <span className="bb-toolbar__btn-label">Fold</span>
        </button>
      </div>

      {caps.export ? (
        <>
          <div className="bb-toolbar__separator bb-toolbar__sep--export" aria-hidden="true" />
          <div className="bb-toolbar__group bb-toolbar__group--export" id="tb-export-group">
            <span className="bb-toolbar__label bb-toolbar__item--pri-export-label bb-toolbar__btn-label">Export:</span>
            {exporters.map((plugin) => {
              const supported = plugin.supportedChips.map((chip) => resolveUiChipId(chip));
              const universal = supported.includes('*');
              const shown = universal || supported.includes(activeChip);
              const label = plugin.uiContributions?.toolbarLabel ?? EXPORTER_DEFAULT_LABELS[plugin.id] ?? plugin.id.toUpperCase();
              const iconName = plugin.uiContributions?.toolbarIcon ?? EXPORTER_DEFAULT_ICONS[plugin.id] ?? 'document-arrow-down';
              const originalTitle = `Export as ${plugin.label} (.${plugin.extension.replace(/^\./, '')})`;
              return (
                <button
                  className="bb-toolbar__btn bb-toolbar__btn--export"
                  data-format={plugin.id}
                  data-supported-chips={universal ? undefined : supported.join(',')}
                  disabled={!exportEnabled}
                  hidden={!shown}
                  key={plugin.id}
                  onClick={() => onExport(plugin.id as ExportFormat)}
                  title={exportEnabled ? originalTitle : `${originalTitle} (parse first)`}
                  type="button"
                >
                  <ToolbarIcon name={iconName} />
                  <span className="bb-toolbar__btn-label">{label}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="bb-toolbar__separator bb-toolbar__sep--verify" aria-hidden="true" />
      <div className="bb-toolbar__group bb-toolbar__group--verify">
        <button className="bb-toolbar__btn" id="tb-verify" onClick={verify} title="Validate the current song (Alt+V)" type="button">
          <ToolbarIcon name="check-circle" />
          <span className="bb-toolbar__btn-label">Verify</span>
        </button>
      </div>

      <div className="bb-toolbar__status" id="tb-status" aria-live="polite" data-type={status.type}>
        {status.message}
      </div>

      <div className="bb-toolbar__group bb-toolbar__group--view bb-toolbar__group--right">
        <button className="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-theme" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} type="button">
          <ToolbarIcon name={theme === 'dark' ? 'sun' : 'moon'} />
          <span className="bb-toolbar__btn-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </div>
  );
}

export function createDesktopToolbar(container: HTMLElement, options: DesktopToolbarOptions): DesktopToolbarHandle {
  const handleRef = { current: null as DesktopToolbarHandle | null };
  let root: Root | null = createRoot(container);

  flushSync(() => {
    root?.render(
      <DesktopToolbar
        {...options}
        toolbarRef={(handle) => {
          handleRef.current = handle;
        }}
      />,
    );
  });

  const call = (fn: (handle: DesktopToolbarHandle) => void) => {
    if (handleRef.current) fn(handleRef.current);
  };

  return {
    show: () => call((handle) => handle.show()),
    hide: () => call((handle) => handle.hide()),
    toggle: () => call((handle) => handle.toggle()),
    isVisible: () => handleRef.current?.isVisible() ?? true,
    dispose: () => {
      handleRef.current?.dispose();
      if (root) {
        root.unmount();
        root = null;
      }
    },
    setChip: (chip) => call((handle) => handle.setChip(chip)),
    setExportEnabled: (enabled) => call((handle) => handle.setExportEnabled(enabled)),
    setThemeIcon: (theme) => call((handle) => handle.setThemeIcon(theme)),
    setStyle: (style) => call((handle) => handle.setStyle(style)),
    setWrapActive: (wrap) => call((handle) => handle.setWrapActive(wrap)),
    setFoldCommentsActive: (folded) => call((handle) => handle.setFoldCommentsActive(folded)),
    setStatus: (message, type) => call((handle) => handle.setStatus(message, type)),
  };
}
