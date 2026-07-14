/**
 * MenuBar — Application menu bar (File / Edit / View / Help)
 *
 * Renders a horizontal bar of dropdown menus following VS Code / desktop-app
 * conventions. Each top-level label opens a dropdown panel with grouped items
 * and keyboard-shortcut hints.
 *
 * Accessibility: top-level buttons carry aria-haspopup/aria-expanded;
 * dropdowns use role="menu"; items use role="menuitem".
 */

import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { EXAMPLE_SONGS, EXAMPLE_SONG_GROUPS, loadRemote } from '@beatbax/app-core/import/remote-loader';
import { createLogger } from '@beatbax/engine/util/logger';
import { icon } from '../utils/icons';
import { appAssetUrl } from '../utils/app-asset-url';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import { exporterRegistry } from '@beatbax/app-core/plugins/browser-exporter-registry';
import { getCurrentCapabilities, getClientProfile } from '@beatbax/app-core/client-profile';
import {
  detectShortcutPlatform,
  formatCommandShortcut,
  primaryModifierLabel,
  type ShortcutCommandId,
} from '@beatbax/app-core/shortcuts';
import { resolveUiChipId } from '../utils/chip-resolve';
import type { LoadingOverlay } from './loading-overlay';

const log = createLogger('ui:menu-bar');

const shortcutPlatform = detectShortcutPlatform();
const shortcutProfile = getClientProfile();
const mod = primaryModifierLabel(shortcutPlatform);
const menuShortcut = (id: ShortcutCommandId) => formatCommandShortcut(id, shortcutProfile, shortcutPlatform);

const RECENT_STORAGE_KEY = 'beatbax:menu.recentFiles';
const MAX_RECENT = 8;
const ABOUT_URL = 'https://github.com/kadraman/beatbax';
const DOCS_URL = 'https://github.com/kadraman/beatbax/tree/main/docs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuBarOptions {
  /** Element the menu bar is appended into. */
  container: HTMLElement;
  /** Shared EventBus. */
  eventBus: EventBus;

  // ── Loading state ───────────────────────────────────────────────────────────
  /** Optional loading overlay shown during async file operations. */
  loadingOverlay?: LoadingOverlay;

  // ── File callbacks ──────────────────────────────────────────────────────────
  /** Create a new empty document (Ctrl+N). */
  onNew?: () => void;
  /** Open a .bax file from disk (Ctrl+O). */
  onOpen?: () => void;
  /** Open a recent file by absolute path (desktop). */
  onOpenRecent?: (filePath: string) => void;
  /** Clear the recent files list. */
  onClearRecent?: () => void;
  /** Called immediately when an example load is initiated. */
  onBeforeExampleLoad?: () => void;
  /** Save the current document (Ctrl+S). */
  onSave?: () => void;
  /** Download the current document with a user-chosen name (Ctrl+Shift+S). */
  onSaveAs?: () => void;
  /**
   * Called when an example or recent file is selected from the menu.
   * @param filename  Suggested filename for the editor tab title.
   * @param content   Full text content.
   */
  onLoadFile?: (filename: string, content: string) => void;

  // ── Edit callbacks ──────────────────────────────────────────────────────────
  /** Undo last edit (Ctrl+Z). */
  onUndo?: () => void;
  /** Redo last undo (Ctrl+Y / Ctrl+Shift+Z). */
  onRedo?: () => void;
  /** Cut selection. */
  onCut?: () => void;
  /** Copy selection. */
  onCopy?: () => void;
  /** Paste from clipboard. */
  onPaste?: () => void;
  /** Select all text in the editor (Ctrl+A). */
  onSelectAll?: () => void;
  /** Open Monaco find widget (Ctrl+F). */
  onFind?: () => void;
  /** Open Monaco find-and-replace widget (Ctrl+H). */
  onReplace?: () => void;

  // ── View callbacks ──────────────────────────────────────────────────────────
  /** Increase editor font size. */
  onZoomIn?: () => void;
  /** Decrease editor font size. */
  onZoomOut?: () => void;
  /** Reset editor font size to default. */
  onZoomReset?: () => void;
  /** Toggle dark / light theme. */
  onToggleTheme?: () => void;
  /** Toggle editor word wrap. */
  onToggleWrapText?: () => void;
  /** Fold or unfold all block comments. */
  onToggleFoldAll?: () => void;
  /** Toggle the AI Copilot chat panel. */
  onToggleAI?: () => boolean | void;
  /** Open the Settings panel (Ctrl+,). */
  onShowSettings?: () => void;
  /** Open the About modal (desktop). */
  onShowAbout?: () => void;
  /** Open Monaco Command Palette (F1 / Ctrl+Alt+P). */
  onOpenCommandPalette?: () => void;

  // ── Keyboard shortcut control ───────────────────────────────────────────────
  /**
   * When false, MenuBar will NOT register its own global keydown handler.
   * Set to false when a central KeyboardShortcuts registry owns all shortcuts.
   * Defaults to true for backward compatibility.
   */
  enableGlobalShortcuts?: boolean;
  /** Open the Keyboard Shortcuts section of the Help Panel (Alt+Shift+K). */
  onShowShortcuts?: () => void;
  /** Export callback for File → Export menu */
  onExport?: (format: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RecentFile {
  filename: string;
  /** Absolute path when available (desktop). */
  path?: string;
  /** ISO timestamp of last open. */
  opened: string;
}

function loadRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RecentFile[];
  } catch { /* ignore */ }
  return [];
}

function saveRecentFiles(files: RecentFile[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(files.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

function recordRecentFile(filename: string): void {
  const files = loadRecentFiles().filter(f => f.filename !== filename);
  files.unshift({ filename, opened: new Date().toISOString() });
  saveRecentFiles(files);
}

function clearRecentFiles(): void {
  saveRecentFiles([]);
}

function isWindowsDesktop(): boolean {
  return typeof window !== 'undefined' && window.electronAPI?.getPlatform?.() === 'win32';
}

function recentFileKey(file: RecentFile): string {
  const identity = file.path ?? file.filename;
  return isWindowsDesktop() ? identity.toLowerCase() : identity;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── MenuBar class ────────────────────────────────────────────────────────────

/** Maps panel ids to menu item ids for toggle checkmarks. */
const PANEL_CHECK_IDS: Record<string, string> = {
  output: 'output-toggle',
  problems: 'problems-toggle',
  toolbar: 'toolbar-toggle',
  'transport-bar': 'transport-bar-toggle',
  'channel-mixer': 'channel-mixer-toggle',
  'song-visualizer': 'song-visualizer-toggle',
  'pattern-grid': 'pattern-grid-toggle',
  help: 'help-panel-toggle',
};

/** Feature-gated panels — no checkmark unless the feature flag is on. */
const PANEL_FEATURE_FLAGS: Partial<Record<string, string>> = {
  'channel-mixer': FeatureFlag.CHANNEL_MIXER,
  'pattern-grid': FeatureFlag.PATTERN_GRID,
  'song-visualizer': FeatureFlag.SONG_VISUALIZER,
};

function isPanelFeatureEnabled(panel: string): boolean {
  const flag = PANEL_FEATURE_FLAGS[panel];
  return !flag || isFeatureEnabled(flag);
}

export class MenuBar {
  private el!: HTMLElement;
  private songNameEl!: HTMLElement;
  /** Currently open menu id, or null. */
  private openMenu: string | null = null;
  /** Active chip — used to filter chip-specific export items. */
  private activeChip = 'gameboy';
  /** AbortController for all document-level listeners. */
  private abort = new AbortController();
  /** Cached example content keyed by path. */
  private exampleCache = new Map<string, string>();
  /** Desktop Open Recent entries (absolute paths); web falls back to localStorage names. */
  private cachedRecentFiles: RecentFile[] = [];
  /** Tracks current visibility state for each toggleable panel. */
  private panelVisible = new Map<string, boolean>([
    ['output', true],
    ['problems', true],
    ['help', true],
    ['shortcuts', true],
    ['channel-mixer', true],
    ['toolbar', true],
    ['transport-bar', true],
    ['pattern-grid', false],
    ['song-visualizer', false],
    ['ai-assistant', false],
  ]);

  constructor(private opts: MenuBarOptions) {
    this.render();
    this.attachGlobal();
    this.listenBus();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record a file in the Open Recent list under File → Open Recent.
   * Call this whenever the editor loads a new file.
   */
  recordRecent(filename: string): void {
    recordRecentFile(filename);
    this.refreshRecentFiles();
  }

  /** Replace Open Recent entries (desktop — absolute paths from main process). */
  setRecentFiles(files: RecentFile[]): void {
    const seen = new Set<string>();
    this.cachedRecentFiles = [];
    for (const file of files) {
      const key = recentFileKey(file);
      if (seen.has(key)) continue;
      seen.add(key);
      this.cachedRecentFiles.push(file);
      if (this.cachedRecentFiles.length >= MAX_RECENT) break;
    }
  }

  dispose(): void {
    this.abort.abort();
    this.el.remove();
    log.debug('MenuBar disposed.');
  }

  // ─── Public shortcut triggers (used by central KeyboardShortcuts registry) ──

  /** Seed the internal visibility map from an external source (e.g. persisted state). */
  seedPanelVisible(states: Record<string, boolean>): void {
    for (const [panel, visible] of Object.entries(states)) {
      this.panelVisible.set(panel, visible);
    }
    this.refreshPanelToggleChecks();
  }

  /** Refresh checkmarks for panel visibility toggles. */
  refreshPanelToggleChecks(): void {
    for (const [panel, menuId] of Object.entries(PANEL_CHECK_IDS)) {
      this.setItemChecked(menuId, this.isPanelEffectivelyVisible(panel));
    }
    this.setItemChecked(
      'ai-assistant',
      isFeatureEnabled(FeatureFlag.AI_ASSISTANT) && (this.panelVisible.get('ai-assistant') ?? false),
    );
  }

  /** True when a panel is both feature-eligible and marked visible. */
  private isPanelEffectivelyVisible(panel: string): boolean {
    if (!isPanelFeatureEnabled(panel)) return false;
    return this.panelVisible.get(panel) ?? false;
  }

  /** Enable or disable a menu item at runtime by its id. */
  setItemEnabled(id: string, enabled: boolean): void {
    const li = this.el.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    if (!li) return;
    li.classList.toggle('bb-menu__item--disabled', !enabled);
    li.setAttribute('aria-disabled', String(!enabled));
    if (enabled) { li.tabIndex = -1; } else { li.removeAttribute('tabindex'); }
  }

  /** Update the checkmark for a checkable menu item. */
  setItemChecked(id: string, checked: boolean): void {
    const li = this.el.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    if (!li) return;
    const gutter = li.querySelector<HTMLElement>('.bb-menu__item-gutter');
    if (gutter) gutter.textContent = checked ? '✓' : '';
    if (li.getAttribute('role') === 'menuitemcheckbox') {
      li.setAttribute('aria-checked', String(checked));
    }
  }

  setWrapTextChecked(checked: boolean): void {
    this.setItemChecked('wrap-text', checked);
  }

  setFoldAllChecked(checked: boolean): void {
    this.setItemChecked('fold-all', checked);
  }

  triggerNew(): void { this.opts.onNew?.(); }
  triggerOpen(): void { this.opts.onOpen?.(); }
  triggerSave(): void { this.opts.onSave?.(); }
  triggerSaveAs(): void { this.opts.onSaveAs?.(); }
  triggerUndo(): void { this.opts.onUndo?.(); }
  triggerRedo(): void { this.opts.onRedo?.(); }
  triggerToggleTheme(): void { this.opts.onToggleTheme?.(); }
  triggerShowShortcuts(): void { this.opts.onShowShortcuts?.(); }
  triggerToggleAI(): void { this.opts.onToggleAI?.(); }
  triggerShowSettings(): void { this.opts.onShowSettings?.(); }

  /**
   * Notify the menu bar of the active chip so that chip-specific export
   * items are shown / hidden the next time the Export submenu opens.
   */
  setChip(chip: string): void {
    this.activeChip = resolveUiChipId(chip);
  }

  /** Update the song name shown in the menu bar title area. */
  setSongName(name: string): void {
    this.songNameEl.textContent = name || 'untitled';
    this.songNameEl.title = name || 'untitled';
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  private render(): void {
    this.el = document.createElement('nav');
    this.el.className = 'bb-menu-bar';
    this.el.setAttribute('role', 'menubar');
    this.el.setAttribute('aria-label', 'Application menu');

    // App icon — mirroring the VS Code title-bar logo placement
    const logoImg = document.createElement('img');
    logoImg.src = appAssetUrl('favicon.svg');
    logoImg.alt = 'BeatBax';
    logoImg.className = 'bb-menu-bar__logo';
    this.el.appendChild(logoImg);

    this.el.appendChild(this.buildMenu('file', 'File', this.fileItems()));
    this.el.appendChild(this.buildMenu('edit', 'Edit', this.editItems()));
    this.el.appendChild(this.buildMenu('view', 'View', this.viewItems()));
    this.el.appendChild(this.buildMenu('help', 'Help', this.helpItems()));

    // ── Song name — centered in the menu bar ───────────────────────────────
    this.songNameEl = document.createElement('span');
    this.songNameEl.className = 'bb-menu-bar__song-name';
    this.songNameEl.textContent = 'untitled';
    this.songNameEl.title = 'untitled';
    this.el.appendChild(this.songNameEl);

    this.opts.container.appendChild(this.el);
  }

  private buildMenu(id: string, label: string, items: MenuItemDef[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'bb-menu';
    wrap.dataset.menuId = id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bb-menu__trigger';
    btn.textContent = label;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `bb-menu-${id}`);

    const panel = document.createElement('ul');
    panel.className = 'bb-menu__panel';
    panel.id = `bb-menu-${id}`;
    panel.setAttribute('role', 'menu');
    panel.hidden = true;

    for (const item of items) {
      panel.appendChild(this.buildItem(item));
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu(id, btn, panel);
    });

    // Keyboard: ArrowDown when trigger has focus → move into panel
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.openMenuPanel(id, btn, panel);
        (this.firstFocusableMenuItem(panel) ?? btn).focus();
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    return wrap;
  }

  private buildItem(def: MenuItemDef): HTMLElement {
    if (def.type === 'separator') {
      const li = document.createElement('li');
      li.className = 'bb-menu__sep';
      li.setAttribute('role', 'separator');
      return li;
    }

    if (def.type === 'submenu') {
      return this.buildSubmenuItem(def);
    }

    const li = document.createElement('li');
    const checkable = !!def.checkable;
    li.setAttribute('role', checkable ? 'menuitemcheckbox' : 'menuitem');
    li.className = 'bb-menu__item' + (def.disabled ? ' bb-menu__item--disabled' : '');
    if (def.disabled) li.setAttribute('aria-disabled', 'true');
    if (def.id) li.dataset.itemId = def.id;
    if (checkable) li.setAttribute('aria-checked', 'false');

    li.innerHTML = `
      <span class="bb-menu__item-gutter" aria-hidden="true"></span>
      <span class="bb-menu__item-label">${esc(def.label)}</span>
      ${def.shortcut ? `<span class="bb-menu__item-shortcut" aria-hidden="true">${esc(def.shortcut)}</span>` : ''}
    `;

    if (def.action) {
      if (!def.disabled) li.tabIndex = -1;
      li.addEventListener('click', () => {
        if (li.classList.contains('bb-menu__item--disabled')) return;
        this.closeAll();
        def.action!();
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!li.classList.contains('bb-menu__item--disabled')) {
            this.closeAll();
            def.action!();
          }
        }
        this.handleItemKeydown(e, li);
      });
    }

    return li;
  }

  private buildSubmenuItem(def: SubmenuItemDef): HTMLElement {
    const li = document.createElement('li');
    li.setAttribute('role', 'menuitem');
    li.setAttribute('aria-haspopup', 'menu');
    li.className = 'bb-menu__item bb-menu__item--submenu';
    if (def.id) li.dataset.itemId = def.id;

    li.innerHTML = `
      <span class="bb-menu__item-gutter" aria-hidden="true"></span>
      <span class="bb-menu__item-label">${esc(def.label)}</span>
      <span class="bb-menu__item-arrow" aria-hidden="true">${icon('chevron-down', 'w-3 h-3 inline-block -rotate-90')}</span>
    `;

    const sub = document.createElement('ul');
    sub.className = 'bb-menu__sub-panel';
    sub.setAttribute('role', 'menu');
    sub.hidden = true;

    // Items will be lazily injected for dynamic menus (recent files, examples)
    if (def.children) {
      for (const child of def.children) {
        sub.appendChild(this.buildItem(child));
      }
    }

    if (def.lazyChildren) {
      li.addEventListener('mouseenter', () => {
        // Re-populate on every open so content stays fresh
        sub.innerHTML = '';
        const children = def.lazyChildren!();
        for (const child of children) sub.appendChild(this.buildItem(child));
        sub.hidden = false;
      });
      li.addEventListener('mouseleave', () => {
        sub.hidden = true;
      });
    } else {
      li.addEventListener('mouseenter', () => { sub.hidden = false; });
      li.addEventListener('mouseleave', () => { sub.hidden = true; });
    }

    li.appendChild(sub);
    return li;
  }

  // ─── Menu structures ─────────────────────────────────────────────────────────

  private fileItems(): MenuItemDef[] {
    return [
      {
        type: 'item',
        label: 'New',
        // Ctrl+N is reserved by browsers (opens a new window) and cannot be
        // intercepted — access New via the menu or toolbar instead.
        action: () => this.opts.onNew?.(),
      },
      {
        type: 'item',
        label: 'Open…',
        shortcut: menuShortcut('file.open'),
        action: () => this.opts.onOpen?.(),
      },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Export',
        id: 'export',
        lazyChildren: () => this.exportItems(),
      },
      {
        type: 'item',
        label: 'Save',
        shortcut: menuShortcut('file.save'),
        action: () => this.opts.onSave?.(),
      },
      {
        type: 'item',
        label: 'Save As…',
        shortcut: menuShortcut('file.saveAs'),
        action: () => this.opts.onSaveAs?.(),
      },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Open Recent',
        id: 'recent-files',
        lazyChildren: () => this.recentFileItems(),
      },
    ];
  }

  private editItems(): MenuItemDef[] {
    return [
      {
        type: 'item',
        label: 'Undo',
        shortcut: menuShortcut('edit.undo'),
        action: () => this.opts.onUndo?.(),
      },
      {
        type: 'item',
        label: 'Redo',
        shortcut: menuShortcut('edit.redo'),
        action: () => this.opts.onRedo?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Cut',
        shortcut: `${mod}+X`,
        action: () => this.opts.onCut?.(),
      },
      {
        type: 'item',
        label: 'Copy',
        shortcut: `${mod}+C`,
        action: () => this.opts.onCopy?.(),
      },
      {
        type: 'item',
        label: 'Paste',
        shortcut: `${mod}+V`,
        action: () => this.opts.onPaste?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Find',
        shortcut: `${mod}+F`,
        action: () => this.opts.onFind?.(),
      },
      {
        type: 'item',
        label: 'Replace',
        shortcut: `${mod}+H`,
        action: () => this.opts.onReplace?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Select All',
        shortcut: `${mod}+A`,
        action: () => this.opts.onSelectAll?.(),
      },
    ];
  }

  /** Toggle a named panel and emit panel:toggled with the new visibility state. */
  private emitPanelToggle(panel: string): void {
    const next = !(this.panelVisible.get(panel) ?? false);
    this.panelVisible.set(panel, next);
    const menuId = PANEL_CHECK_IDS[panel];
    if (menuId) this.setItemChecked(menuId, this.isPanelEffectivelyVisible(panel));
    this.opts.eventBus.emit('panel:toggled', { panel, visible: next });
  }

  /** Show a tab panel (always emits visible:true). */
  private emitPanelShow(panel: string): void {
    this.panelVisible.set(panel, true);
    const menuId = PANEL_CHECK_IDS[panel];
    if (menuId) this.setItemChecked(menuId, this.isPanelEffectivelyVisible(panel));
    this.opts.eventBus.emit('panel:toggled', { panel, visible: true });
  }

  private viewItems(): MenuItemDef[] {
    const caps = getCurrentCapabilities();
    const aiItems: MenuItemDef[] = caps.copilot ? [
      { type: 'separator' },
      {
        type: 'item',
        label: 'AI Assistant',
        id: 'ai-assistant',
        checkable: true,
        shortcut: menuShortcut('tools.toggleCopilot'),
        disabled: !isFeatureEnabled(FeatureFlag.AI_ASSISTANT),
        action: () => {
          const visible = this.opts.onToggleAI?.();
          const checked = typeof visible === 'boolean'
            ? visible
            : isFeatureEnabled(FeatureFlag.AI_ASSISTANT);
          this.panelVisible.set('ai-assistant', checked);
          this.setItemChecked('ai-assistant', checked);
        },
      },
    ] : [];

    return [
      {
        type: 'item',
        label: 'Command Palette…',
        shortcut: menuShortcut('tools.openCommandPalette'),
        action: () => this.opts.onOpenCommandPalette?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Output',
        id: 'output-toggle',
        checkable: true,
        shortcut: menuShortcut('view.showOutput'),
        action: () => this.emitPanelToggle('output'),
      },
      {
        type: 'item',
        label: 'Problems',
        id: 'problems-toggle',
        checkable: true,
        shortcut: menuShortcut('view.showProblems'),
        action: () => this.emitPanelToggle('problems'),
      },
      {
        type: 'item',
        label: 'Toolbar',
        id: 'toolbar-toggle',
        checkable: true,
        shortcut: menuShortcut('view.toggleToolbar'),
        action: () => this.emitPanelToggle('toolbar'),
      },
      {
        type: 'item',
        label: 'Transport Bar',
        id: 'transport-bar-toggle',
        checkable: true,
        shortcut: menuShortcut('view.toggleTransportBar'),
        action: () => this.emitPanelToggle('transport-bar'),
      },
      {
        type: 'item',
        label: 'Channel Mixer',
        id: 'channel-mixer-toggle',
        checkable: true,
        shortcut: menuShortcut('view.toggleChannelMixer'),
        disabled: !isFeatureEnabled(FeatureFlag.CHANNEL_MIXER),
        action: () => this.emitPanelToggle('channel-mixer'),
      },
      {
        type: 'item',
        label: 'Song Visualizer',
        id: 'song-visualizer-toggle',
        checkable: true,
        shortcut: menuShortcut('view.showSongVisualizer'),
        disabled: !isFeatureEnabled(FeatureFlag.SONG_VISUALIZER),
        action: () => this.emitPanelToggle('song-visualizer'),
      },
      {
        type: 'item',
        label: 'Pattern Grid',
        id: 'pattern-grid-toggle',
        checkable: true,
        shortcut: menuShortcut('view.togglePatternGrid'),
        disabled: !isFeatureEnabled(FeatureFlag.PATTERN_GRID),
        action: () => this.emitPanelToggle('pattern-grid'),
      },
      ...aiItems,
      { type: 'separator' },
      {
        type: 'item',
        label: 'Wrap Text',
        id: 'wrap-text',
        checkable: true,
        action: () => this.opts.onToggleWrapText?.(),
      },
      {
        type: 'item',
        label: 'Fold All',
        id: 'fold-all',
        checkable: true,
        action: () => this.opts.onToggleFoldAll?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Zoom In',
        shortcut: `${mod}++`,
        action: () => this.opts.onZoomIn?.(),
      },
      {
        type: 'item',
        label: 'Zoom Out',
        shortcut: `${mod}+-`,
        action: () => this.opts.onZoomOut?.(),
      },
      {
        type: 'item',
        label: 'Reset Zoom',
        shortcut: `${mod}+0`,
        action: () => this.opts.onZoomReset?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Theme (Dark / Light)',
        shortcut: menuShortcut('view.toggleTheme'),
        action: () => this.opts.onToggleTheme?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Settings…',
        shortcut: menuShortcut('tools.openSettings'),
        action: () => this.opts.onShowSettings?.(),
      },
    ];
  }

  private helpItems(): MenuItemDef[] {
    const items: MenuItemDef[] = [
      {
        type: 'item',
        label: 'Documentation',
        action: () => window.open(DOCS_URL, '_blank', 'noopener,noreferrer'),
      },
      {
        type: 'item',
        label: 'Keyboard Shortcuts…',
        shortcut: menuShortcut('help.showShortcuts'),
        action: () => this.opts.onShowShortcuts?.(),
      },
      {
        type: 'item',
        label: 'Help Panel…',
        id: 'help-panel-toggle',
        checkable: true,
        shortcut: menuShortcut('help.showHelp'),
        action: () => this.emitPanelToggle('help'),
      },
    ];

    if (getCurrentCapabilities().exampleMenu) {
      items.push(
        { type: 'separator' },
        {
          type: 'submenu',
          label: 'Examples',
          id: 'examples',
          lazyChildren: () => this.exampleItems(),
        },
      );
    }

    items.push(
      { type: 'separator' },
      {
        type: 'item',
        label: 'About BeatBax',
        action: () => {
          if (this.opts.onShowAbout) this.opts.onShowAbout();
          else window.open(ABOUT_URL, '_blank', 'noopener,noreferrer');
        },
      },
    );

    return items;
  }

  // ─── Dynamic item builders ────────────────────────────────────────────────────

  private exportItems(): MenuItemDef[] {
    const plugins = exporterRegistry.all().slice().sort((a, b) => {
      const aUniversal = a.supportedChips.includes('*');
      const bUniversal = b.supportedChips.includes('*');
      if (aUniversal !== bUniversal) return aUniversal ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    const universal: MenuItemDef[] = [];
    const chipSpecific: MenuItemDef[] = [];

    for (const plugin of plugins) {
      const isUniversal = plugin.supportedChips.includes('*');
      const ext = plugin.extension.startsWith('.') ? plugin.extension : `.${plugin.extension}`;
      const item: MenuItemDef = {
        type: 'item',
        label: `Export as ${plugin.label} (${ext})`,
        action: () => this.opts.onExport?.(plugin.id),
      };

      if (isUniversal) {
        universal.push(item);
      } else if (plugin.supportedChips.some((c) => c === this.activeChip)) {
        chipSpecific.push(item);
      }
    }

    const items: MenuItemDef[] = [...universal];

    if (chipSpecific.length > 0) {
      if (items.length > 0) {
        items.push({ type: 'separator' });
      }
      items.push(...chipSpecific);
    }

    if (items.length === 0) {
      return [{ type: 'item', label: '(no exporters available)', disabled: true, action: () => {} }];
    }

    return items;
  }

  private recentFileItems(): MenuItemDef[] {
    const isDesktopRecentList = !!this.opts.onOpenRecent;
    const recent = isDesktopRecentList
      ? this.cachedRecentFiles
      : loadRecentFiles();
    if (recent.length === 0) {
      return [{ type: 'item', label: '(no recent files)', disabled: true, action: () => {} }];
    }
    return [
      ...recent.map((f) => ({
        type: 'item' as const,
        label: f.filename,
        action: () => {
          if (f.path) {
            this.opts.onOpenRecent?.(f.path);
            return;
          }
          log.debug(`Recent file clicked (name only): ${f.filename}`);
          this.opts.onOpen?.();
        },
      })),
      { type: 'separator' as const },
      {
        type: 'item' as const,
        label: 'Clear Recently Opened...',
        disabled: isDesktopRecentList && !this.opts.onClearRecent,
        action: () => {
          if (isDesktopRecentList) {
            this.cachedRecentFiles = [];
            this.opts.onClearRecent?.();
            return;
          }
          clearRecentFiles();
        },
      },
    ];
  }

  private exampleItems(): MenuItemDef[] {
    return EXAMPLE_SONG_GROUPS.map(group => ({
      type: 'submenu' as const,
      label: group.group,
      children: group.songs.map(s => ({
        type: 'item' as const,
        label: s.label,
        action: () => this.loadExample(s.path, s.label),
      })),
    }));
  }

  private async loadExample(path: string, label: string): Promise<void> {
    this.opts.onBeforeExampleLoad?.();

    const cached = this.exampleCache.get(path);
    if (cached !== undefined) {
      const filename = label || path.split('/').pop() || 'example.bax';
      this.opts.onLoadFile?.(filename, cached);
      return;
    }

    this.opts.loadingOverlay?.show();
    try {
      const result = await loadRemote(path);
      const filename = label || result.filename;
      this.exampleCache.set(path, result.content);
      this.opts.onLoadFile?.(filename, result.content);
      log.debug(`Loaded example: ${path}`);
    } catch (err: any) {
      log.error('Failed to load example:', err);
      this.opts.loadingOverlay?.hide();
    }
  }

  // ─── Open / close logic ───────────────────────────────────────────────────────

  private toggleMenu(id: string, btn: HTMLButtonElement, panel: HTMLUListElement): void {
    if (this.openMenu === id) {
      this.closeAll();
    } else {
      this.openMenuPanel(id, btn, panel);
    }
  }

  private openMenuPanel(id: string, btn: HTMLButtonElement, panel: HTMLUListElement): void {
    // Close any other open menus first
    this.closeAll();
    this.openMenu = id;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('bb-menu__trigger--active');
    if (id === 'view' || id === 'help') this.refreshPanelToggleChecks();
  }

  private firstFocusableMenuItem(panel: HTMLElement): HTMLElement | null {
    return panel.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])',
    );
  }

  private closeAll(): void {
    if (!this.openMenu) return;
    const wrap = this.el.querySelector<HTMLElement>(`[data-menu-id="${this.openMenu}"]`);
    if (wrap) {
      (wrap.querySelector<HTMLButtonElement>('.bb-menu__trigger'))?.setAttribute('aria-expanded', 'false');
      (wrap.querySelector<HTMLButtonElement>('.bb-menu__trigger'))?.classList.remove('bb-menu__trigger--active');
      const panel = wrap.querySelector<HTMLElement>('.bb-menu__panel');
      if (panel) panel.hidden = true;
    }
    this.openMenu = null;
  }

  // ─── Keyboard navigation inside a panel ───────────────────────────────────────

  private handleItemKeydown(e: KeyboardEvent, current: HTMLElement): void {
    const panel = current.closest<HTMLElement>('.bb-menu__panel, .bb-menu__sub-panel');
    if (!panel) return;
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])',
      ),
    );
    const idx = items.indexOf(current);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      this.closeAll();
    }
  }

  // ─── Global wiring ────────────────────────────────────────────────────────────

  private attachGlobal(): void {
    const sig = this.abort.signal;

    // Close menus when clicking outside
    document.addEventListener('click', () => this.closeAll(), { signal: sig });

    // Prevent click-inside from triggering the document close
    this.el.addEventListener('click', (e) => e.stopPropagation(), { signal: sig });

    // Always support closing menus with Escape (even when global shortcuts are disabled)
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If a menu is open, close it and restore focus to its trigger
        if (this.openMenu) {
          const wrap = this.el.querySelector<HTMLElement>(`[data-menu-id="${this.openMenu}"]`);
          const trigger = wrap?.querySelector<HTMLButtonElement>('.bb-menu__trigger');
          this.closeAll();
          try { trigger?.focus(); } catch { /* ignore focus errors */ }
          e.stopPropagation();
          e.preventDefault();
        }
      }
    }, { signal: sig });

    // Only register the global keydown handler when the central keyboard
    // shortcuts registry is NOT in use (enableGlobalShortcuts defaults to true).
    if (this.opts.enableGlobalShortcuts !== false) {
      document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e), { signal: sig });
    }
  }

  private handleGlobalKeydown(e: KeyboardEvent): void {
    // Don't intercept when Monaco has focus (it handles Ctrl+Z/Y/F/H itself)
    const active = document.activeElement as HTMLElement | null;
    const inMonaco = active?.closest('.monaco-editor') !== null;

    if (e.key === 'Escape') {
      this.closeAll();
      return;
    }

    // Allow Monaco to handle its own shortcuts
    if (inMonaco) return;

    // Treat Cmd (Meta) as Ctrl so shortcuts work on macOS as well as Windows/Linux.
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && !e.shiftKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          this.opts.onNew?.();
          break;
        case 'o':
          e.preventDefault();
          this.opts.onOpen?.();
          break;
        case 's':
          e.preventDefault();
          this.opts.onSave?.();
          break;
        case 'z':
          e.preventDefault();
          this.opts.onUndo?.();
          break;
        case 'y':
          e.preventDefault();
          this.opts.onRedo?.();
          break;
      }
      return;
    }

    if (ctrl && e.shiftKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          this.opts.onSaveAs?.();
          break;
        case 'z':
          e.preventDefault();
          this.opts.onRedo?.();
          break;
        case 't':
          e.preventDefault();
          this.opts.onToggleTheme?.();
          break;
        case 'h':
          e.preventDefault();
          this.emitPanelToggle('help');
          break;
        case 'm':
          e.preventDefault();
          this.emitPanelToggle('channel-mixer');
          break;
        case 'b':
          e.preventDefault();
          this.emitPanelToggle('toolbar');
          break;
        case 'r':
          e.preventDefault();
          this.emitPanelToggle('transport-bar');
          break;
      }
      return;
    }

    if (ctrl && !e.shiftKey && !e.altKey && e.key === '`') {
      e.preventDefault();
      this.emitPanelToggle('output');
    }
  }

  private listenBus(): void {
    // When a file is loaded externally (toolbar open, drag-drop), record it
    this.opts.eventBus.on('song:loaded', ({ filename }) => {
      if (this.opts.onOpenRecent) return;
      recordRecentFile(filename);
    });

    // Keep panelVisible in sync with any panel:toggled event regardless of
    // who emitted it (keyboard shortcuts, toolbar buttons, other components).
    this.opts.eventBus.on('panel:toggled', ({ panel, visible }) => {
      this.panelVisible.set(panel, visible);
      const menuId = PANEL_CHECK_IDS[panel];
      if (menuId) this.setItemChecked(menuId, this.isPanelEffectivelyVisible(panel));
      if (panel === 'ai-assistant') {
        this.setItemChecked(
          'ai-assistant',
          isFeatureEnabled(FeatureFlag.AI_ASSISTANT) && visible,
        );
      }
    });

    // Disable / re-enable feature-gated menu items when the flag is toggled.
    this.opts.eventBus.on('feature-flag:changed', ({ flag, enabled }) => {
      if (flag === FeatureFlag.SONG_VISUALIZER) this.setItemEnabled('song-visualizer-toggle', enabled);
      if (flag === FeatureFlag.PATTERN_GRID)    this.setItemEnabled('pattern-grid-toggle', enabled);
      if (flag === FeatureFlag.AI_ASSISTANT)    this.setItemEnabled('ai-assistant', enabled);
      if (flag === FeatureFlag.CHANNEL_MIXER)   this.setItemEnabled('channel-mixer-toggle', enabled);
      if (
        flag === FeatureFlag.SONG_VISUALIZER
        || flag === FeatureFlag.PATTERN_GRID
        || flag === FeatureFlag.AI_ASSISTANT
        || flag === FeatureFlag.CHANNEL_MIXER
      ) {
        this.refreshPanelToggleChecks();
      }
    });
  }

  // ─── Refresh helpers ──────────────────────────────────────────────────────────

  private refreshRecentFiles(): void {
    // The submenu is rebuilt lazily on each hover, so nothing to update eagerly.
  }

  // ─── Styles ───────────────────────────────────────────────────────────────────
}

// ─── Internal menu-item descriptor types ──────────────────────────────────────
// (not exported — callers use the public callback API)

interface BaseItemDef {
  /** Stable id for lookups (optional). */
  id?: string;
  disabled?: boolean;
}

interface ActionItemDef extends BaseItemDef {
  type: 'item';
  label: string;
  shortcut?: string;
  /** Show a checkmark in the left gutter when toggled on. */
  checkable?: boolean;
  action: () => void;
}

interface SeparatorDef {
  type: 'separator';
}

interface SubmenuItemDef extends BaseItemDef {
  type: 'submenu';
  label: string;
  /** Static children (resolved at render time). */
  children?: MenuItemDef[];
  /** Dynamic children (resolved each time the submenu opens). */
  lazyChildren?: () => MenuItemDef[];
}

type MenuItemDef = ActionItemDef | SeparatorDef | SubmenuItemDef;
