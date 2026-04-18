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

import type { EventBus } from '../utils/event-bus';
import { EXAMPLE_SONGS, EXAMPLE_SONG_GROUPS, loadRemote } from '../import/remote-loader';
import { createLogger } from '@beatbax/engine/util/logger';
import { icon } from '../utils/icons';

const log = createLogger('ui:menu-bar');

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

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

  // ── File callbacks ──────────────────────────────────────────────────────────
  /** Create a new empty document (Ctrl+N). */
  onNew?: () => void;
  /** Open a .bax file from disk (Ctrl+O). */
  onOpen?: () => void;
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
  /** Toggle the AI Copilot chat panel. */
  onToggleAI?: () => void;
  /** Open the Settings panel (Ctrl+,). */
  onShowSettings?: () => void;

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
  onExport?: (format: 'json' | 'midi' | 'uge' | 'wav') => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RecentFile {
  filename: string;
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

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── MenuBar class ────────────────────────────────────────────────────────────

export class MenuBar {
  private el!: HTMLElement;
  private songNameEl!: HTMLElement;
  /** Currently open menu id, or null. */
  private openMenu: string | null = null;
  /** AbortController for all document-level listeners. */
  private abort = new AbortController();
  /** Cached example content keyed by path. */
  private exampleCache = new Map<string, string>();
  /** Tracks current visibility state for each toggleable panel. */
  private panelVisible = new Map<string, boolean>([
    ['output', true],
    ['problems', true],
    ['help', true],
    ['shortcuts', true],
    ['daw-mixer', true],
    ['toolbar', true],
    ['transport-bar', true],
    ['ai-assistant', false],
  ]);

  constructor(private opts: MenuBarOptions) {
    this.render();
    this.attachGlobal();
    this.listenBus();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record a file in the "Recent Files" list that appears under File > Recent Files.
   * Call this whenever the editor loads a new file.
   */
  recordRecent(filename: string): void {
    recordRecentFile(filename);
    this.refreshRecentFiles();
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
  }

  /** Enable or disable a menu item at runtime by its id. */
  setItemEnabled(id: string, enabled: boolean): void {
    const li = this.el.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    if (!li) return;
    li.classList.toggle('bb-menu__item--disabled', !enabled);
    li.setAttribute('aria-disabled', String(!enabled));
    if (enabled) { li.tabIndex = -1; } else { li.removeAttribute('tabindex'); }
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
    logoImg.src = '/favicon.svg';
    logoImg.alt = 'BeatBax';
    logoImg.className = 'bb-menu-bar__logo';
    this.el.appendChild(logoImg);

    this.el.appendChild(this.buildMenu('file', 'File', this.fileItems()));
    this.el.appendChild(this.buildMenu('edit', 'Edit', this.editItems()));
    this.el.appendChild(this.buildMenu('view', 'View', this.viewItems()));
    this.el.appendChild(this.buildMenu('help', 'Help', this.helpItems()));

    // ── Song name — right-aligned in the remaining menu bar space ──────────
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
        (panel.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])') ?? btn).focus();
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
    li.setAttribute('role', 'menuitem');
    li.className = 'bb-menu__item' + (def.disabled ? ' bb-menu__item--disabled' : '');
    if (def.disabled) li.setAttribute('aria-disabled', 'true');
    if (def.id) li.dataset.itemId = def.id;

    li.innerHTML = `
      ${def.icon ? `<span class="bb-menu__item-icon" aria-hidden="true">${icon(def.icon, 'w-3.5 h-3.5 inline-block align-text-bottom')}</span>` : ''}
      <span class="bb-menu__item-label">${esc(def.label)}</span>
      ${def.shortcut ? `<span class="bb-menu__item-shortcut" aria-hidden="true">${esc(def.shortcut)}</span>` : ''}
    `;

    if (!def.disabled && def.action) {
      li.tabIndex = -1;
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
      <span class="bb-menu__item-icon" aria-hidden="true">${def.icon ? icon(def.icon, 'w-3.5 h-3.5 inline-block align-text-bottom') : ''}</span>
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
        icon: 'document-plus',
        // Ctrl+N is reserved by browsers (opens a new window) and cannot be
        // intercepted — access New via the menu or toolbar instead.
        action: () => this.opts.onNew?.(),
      },
      {
        type: 'item',
        label: 'Open…',
        icon: 'folder-open',
        shortcut: 'Ctrl+O',
        action: () => this.opts.onOpen?.(),
      },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Export',
        icon: 'arrow-up-tray',
        id: 'export',
        children: [
          { type: 'item', icon: 'document',      label: 'Export as JSON', action: () => this.opts.onExport?.('json') },
          { type: 'item', icon: 'musical-note',  label: 'Export as MIDI', action: () => this.opts.onExport?.('midi') },
          { type: 'item', icon: 'cpu-chip',      label: 'Export as UGE',  action: () => this.opts.onExport?.('uge') },
          { type: 'item', icon: 'speaker-wave',  label: 'Export as WAV',  action: () => this.opts.onExport?.('wav') },
        ],
      },
      {
        type: 'item',
        label: 'Save',
        icon: 'arrow-down-tray',
        shortcut: 'Ctrl+S',
        action: () => this.opts.onSave?.(),
      },
      {
        type: 'item',
        label: 'Save As…',
        icon: 'document-arrow-down',
        shortcut: 'Ctrl+Shift+S',
        action: () => this.opts.onSaveAs?.(),
      },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Recent Files',
        icon: 'clock',
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
        icon: 'arrow-uturn-left',
        shortcut: 'Ctrl+Z',
        action: () => this.opts.onUndo?.(),
      },
      {
        type: 'item',
        label: 'Redo',
        icon: 'arrow-uturn-right',
        shortcut: 'Ctrl+Y',
        action: () => this.opts.onRedo?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Cut',
        icon: 'scissors',
        shortcut: 'Ctrl+X',
        action: () => this.opts.onCut?.(),
      },
      {
        type: 'item',
        label: 'Copy',
        icon: 'document-duplicate',
        shortcut: 'Ctrl+C',
        action: () => this.opts.onCopy?.(),
      },
      {
        type: 'item',
        label: 'Paste',
        icon: 'clipboard-document',
        shortcut: 'Ctrl+V',
        action: () => this.opts.onPaste?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Find',
        icon: 'magnifying-glass',
        shortcut: 'Ctrl+F',
        action: () => this.opts.onFind?.(),
      },
      {
        type: 'item',
        label: 'Replace',
        icon: 'arrows-right-left',
        shortcut: 'Ctrl+H',
        action: () => this.opts.onReplace?.(),
      },
    ];
  }

  /** Toggle a named panel and emit panel:toggled with the new visibility state. */
  private emitPanelToggle(panel: string): void {
    const next = !(this.panelVisible.get(panel) ?? false);
    this.panelVisible.set(panel, next);
    this.opts.eventBus.emit('panel:toggled', { panel, visible: next });
  }

  /** Show a tab panel (always emits visible:true). */
  private emitPanelShow(panel: string): void {
    this.panelVisible.set(panel, true);
    this.opts.eventBus.emit('panel:toggled', { panel, visible: true });
  }

  private viewItems(): MenuItemDef[] {
    return [
      {
        type: 'item',
        label: 'Output',
        icon: 'command-line',
        shortcut: 'Ctrl+`',
        action: () => this.emitPanelShow('output'),
      },
      {
        type: 'item',
        label: 'Problems',
        icon: 'exclamation-triangle',
        shortcut: 'Alt+Shift+P',
        action: () => this.emitPanelShow('problems'),
      },
      {
        type: 'item',
        label: 'Toolbar',
        icon: 'bars-3',
        shortcut: 'Ctrl+Shift+B',
        action: () => this.emitPanelToggle('toolbar'),
      },
      {
        type: 'item',
        label: 'Transport Bar',
        icon: 'queue-list',
        shortcut: 'Ctrl+Shift+R',
        action: () => this.emitPanelToggle('transport-bar'),
      },
      {
        type: 'item',
        label: 'Song Visualizer',
        icon: 'adjustments-horizontal',
        shortcut: 'Ctrl+Shift+V',
        id: 'song-visualizer-toggle',
        action: () => this.emitPanelToggle('song-visualizer'),
      },
      {
        type: 'item',
        label: 'Pattern Grid',
        icon: 'bars-3-center-left',
        shortcut: 'Ctrl+Shift+G',
        action: () => this.emitPanelToggle('pattern-grid'),
      },
/*      {
        type: 'item',
        label: 'Help',
        shortcut: 'Shift+F1',
        action: () => this.emitPanelShow('help'),
      },
      {
        type: 'item',
        label: 'Shortcuts',
        shortcut: 'Alt+Shift+K',
        action: () => this.emitPanelShow('shortcuts'),
      },
      */
      { type: 'separator' },
      {
        type: 'item',
        label: 'AI Assistant',
        icon: 'sparkles',
        shortcut: 'Alt+Shift+I',
        id: 'ai-assistant',
        action: () => this.opts.onToggleAI?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Zoom In',
        icon: 'magnifying-glass-plus',
        shortcut: 'Ctrl++',
        action: () => this.opts.onZoomIn?.(),
      },
      {
        type: 'item',
        label: 'Zoom Out',
        icon: 'magnifying-glass-minus',
        shortcut: 'Ctrl+-',
        action: () => this.opts.onZoomOut?.(),
      },
      {
        type: 'item',
        label: 'Reset Zoom',
        icon: 'arrows-pointing-in',
        shortcut: 'Ctrl+0',
        action: () => this.opts.onZoomReset?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Theme (Dark / Light)',
        icon: 'sun',
        shortcut: 'Ctrl+Shift+L',
        action: () => this.opts.onToggleTheme?.(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Settings…',
        icon: 'cog-6-tooth',
        shortcut: `${isMac ? 'Cmd' : 'Ctrl'}+,`,
        action: () => this.opts.onShowSettings?.(),
      },
    ];
  }

  private helpItems(): MenuItemDef[] {
    return [
      {
        type: 'item',
        label: 'Documentation',
        icon: 'information-circle',
        action: () => window.open(DOCS_URL, '_blank', 'noopener,noreferrer'),
      },
      {
        type: 'item',
        label: 'Keyboard Shortcuts…',
        icon: 'key',
        shortcut: 'Alt+Shift+K',
        action: () => this.opts.onShowShortcuts?.(),
      },
      {
        // Opens the full Help Panel (syntax reference, snippets, keyboard shortcuts).
        label: 'Help Panel…',
        icon: 'question-mark-circle',
        type: 'item',
        shortcut: 'Shift+F1',
        action: () => this.emitPanelToggle('help'),
      },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Examples',
        icon: 'book-open',
        id: 'examples',
        lazyChildren: () => this.exampleItems(),
      },
      { type: 'separator' },
      {
        type: 'item',
        label: 'About BeatBax',
        icon: 'globe-alt',
        action: () => window.open(ABOUT_URL, '_blank', 'noopener,noreferrer'),
      },
    ];
  }

  // ─── Dynamic item builders ────────────────────────────────────────────────────

  private recentFileItems(): MenuItemDef[] {
    const recent = loadRecentFiles();
    if (recent.length === 0) {
      return [{ type: 'item', label: '(no recent files)', disabled: true, action: () => {} }];
    }
    return recent.map(f => ({
      type: 'item' as const,
      label: f.filename,
      action: () => {
        // Recent files are stored by name only — we can only re-open via the file-picker
        log.debug(`Recent file clicked: ${f.filename}`);
        this.opts.onOpen?.();
      },
    }));
  }

  private exampleItems(): MenuItemDef[] {
    return EXAMPLE_SONG_GROUPS.map(group => ({
      type: 'submenu' as const,
      label: group.group,
      icon: 'cpu-chip',
      children: group.songs.map(s => ({
        type: 'item' as const,
        label: s.label,
        action: () => this.loadExample(s.path, s.label),
      })),
    }));
  }

  private async loadExample(path: string, label: string): Promise<void> {
    const cached = this.exampleCache.get(path);
    if (cached !== undefined) {
      const filename = label || path.split('/').pop() || 'example.bax';
      this.opts.onLoadFile?.(filename, cached);
      return;
    }

    try {
      const result = await loadRemote(path);
      const filename = label || result.filename;
      this.exampleCache.set(path, result.content);
      this.opts.onLoadFile?.(filename, result.content);
      log.debug(`Loaded example: ${path}`);
    } catch (err: any) {
      log.error('Failed to load example:', err);
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
    const panel = current.closest<HTMLElement>('.bb-menu__panel');
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
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
          this.emitPanelToggle('daw-mixer');
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
      recordRecentFile(filename);
    });

    // Keep panelVisible in sync with any panel:toggled event regardless of
    // who emitted it (keyboard shortcuts, toolbar buttons, other components).
    this.opts.eventBus.on('panel:toggled', ({ panel, visible }) => {
      this.panelVisible.set(panel, visible);
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
  /** Optional heroicon name to prefix the label. */
  icon?: string;
  action: () => void;
}

interface SeparatorDef {
  type: 'separator';
}

interface SubmenuItemDef extends BaseItemDef {
  type: 'submenu';
  label: string;
  /** Optional heroicon name to prefix the label. */
  icon?: string;
  /** Static children (resolved at render time). */
  children?: MenuItemDef[];
  /** Dynamic children (resolved each time the submenu opens). */
  lazyChildren?: () => MenuItemDef[];
}

type MenuItemDef = ActionItemDef | SeparatorDef | SubmenuItemDef;
