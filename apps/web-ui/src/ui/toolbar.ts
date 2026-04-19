/**
 * Toolbar - Export controls and file open/save toolbar
 * Provides: Open, example songs, export format buttons, drag-and-drop trigger
 */

import type { EventBus } from '../utils/event-bus';
import type { ExportFormat } from '../export/export-manager';
import { EXAMPLE_SONGS, EXAMPLE_SONG_GROUPS, loadRemote } from '../import/remote-loader';
import { createLogger } from '@beatbax/engine/util/logger';
import { icon } from '../utils/icons';

const log = createLogger('ui:toolbar');

export interface ToolbarOptions {
  /** Container element to render the toolbar into */
  container: HTMLElement;
  /** EventBus for global state events */
  eventBus: EventBus;
  /** Called when a file should be loaded (filename, content) */
  onLoad: (filename: string, content: string) => void;
  /** Called when an export is requested */
  onExport: (format: ExportFormat) => void;
  /** Called when the editor should be focused on its content */
  onVerify?: () => void;
  /** Create a new empty document (Ctrl+N). */
  onNew?: () => void;
  /** Save / download the current document (Ctrl+S). */
  onSave?: () => void;
  /** Undo the last edit. */
  onUndo?: () => void;
  /** Redo the last undone edit. */
  onRedo?: () => void;
  /** Format / auto-indent the document. */
  onFormat?: () => void;
  /** Select all text in the editor. */
  onSelectAll?: () => void;
  /** Toggle dark/light theme. */
  onToggleTheme?: () => void;
  /** Toggle word-wrap. Receives the new enabled state. */
  onToggleWrap?: (enabled: boolean) => void;
}

export class Toolbar {
  private el!: HTMLElement;
  private activeChip = 'gameboy';
  private _wrapEnabled = false;
  private _themeToggleBtn?: HTMLButtonElement;
  private _wrapToggleBtn?: HTMLButtonElement;
  /** Pre-fetched example content keyed by path, populated when dropdown first opens. */
  private exampleCache = new Map<string, string>();
  /** AbortController whose signal is passed to every document-level listener so they
   *  can all be removed in a single abort() call from dispose(). */
  private abortController = new AbortController();

  constructor(private options: ToolbarOptions) {
    this.render();
    this.attachEvents();
  }

  private render(): void {
    const { container } = this.options;

    this.el = document.createElement('div');
    this.el.className = 'bb-toolbar';
    this.el.innerHTML = `
      <div class="bb-toolbar__group bb-toolbar__group--file">
        <button class="bb-toolbar__btn bb-toolbar__btn--icon bb-toolbar__item--pri-new" id="tb-new" title="New song (Ctrl+N)">
          ${icon('document-plus', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">New</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--icon bb-toolbar__item--pri-save" id="tb-save" title="Save .bax file (Ctrl+S)">
          ${icon('arrow-down-tray', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Save</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--icon bb-toolbar__item--pri-open" id="tb-open" title="Open .bax file (Ctrl+O)">
          ${icon('folder-open', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Open</span>
        </button>
        <div class="bb-toolbar__dropdown-wrap bb-toolbar__item--pri-examples">
          <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-examples-btn" title="Load an example song"
            aria-haspopup="true" aria-expanded="false">
            ${icon('musical-note', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Examples</span> ${icon('chevron-down', 'w-3 h-3 inline-block align-middle bb-toolbar__btn-label')}
          </button>
          <div class="bb-examples-panel" id="tb-examples-panel" hidden></div>
        </div>
      </div>

      <div class="bb-toolbar__separator bb-toolbar__sep--edit" aria-hidden="true"></div>

      <div class="bb-toolbar__group bb-toolbar__group--edit">
        <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-undo" title="Undo (Ctrl+Z)">
          ${icon('arrow-uturn-left', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Undo</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-redo" title="Redo (Ctrl+Y)">
          ${icon('arrow-uturn-right', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Redo</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-format" title="Format document">{ } <span class="bb-toolbar__btn-label">Format</span></button>
        <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-wrap" title="Toggle word wrap">${icon('arrow-path', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Wrap</span></button>
        <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-selectall" title="Select All (Ctrl+A)">
          ${icon('bars-3', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Select All</span>
        </button>
      </div>

      <div class="bb-toolbar__separator bb-toolbar__sep--edit" aria-hidden="true"></div>

      <div class="bb-toolbar__group bb-toolbar__group--export">
        <span class="bb-toolbar__label bb-toolbar__item--pri-export-label bb-toolbar__btn-label">Export:</span>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="json" title="Export as JSON (ISM format)">
          ${icon('document', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">JSON</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="midi" title="Export as MIDI (4-track Standard MIDI File)">
          ${icon('musical-note', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">MIDI</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="uge" data-supported-chips="gameboy,gb,dmg" title="Export as UGE (hUGETracker v6)">
          ${icon('cpu-chip', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">UGE</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="wav" title="Export as WAV (rendered audio)">
          ${icon('speaker-wave', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">WAV</span>
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="famitracker" data-supported-chips="nes" title="Export as FamiTracker (.ftm) [placeholder]">
          ${icon('command-line', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">FTM</span>
        </button>
      </div>

      <div class="bb-toolbar__separator bb-toolbar__sep--verify" aria-hidden="true"></div>

      <div class="bb-toolbar__group bb-toolbar__group--verify">
        <button class="bb-toolbar__btn" id="tb-verify" title="Validate the current song (Alt+V)">
          ${icon('check-circle', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Verify</span>
        </button>
      </div>

      <div class="bb-toolbar__separator bb-toolbar__sep--view" aria-hidden="true"></div>

      <div class="bb-toolbar__group bb-toolbar__group--view">
        <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-theme" title="Switch to light theme">
          ${icon('sun', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Light</span>
        </button>
      </div>

      <div class="bb-toolbar__status" id="tb-status" aria-live="polite"></div>
    `;

    container.appendChild(this.el);
    this.setChip(this.activeChip);
  }

  private attachEvents(): void {
    const { eventBus, onLoad, onExport, onVerify,
            onNew, onSave, onUndo, onRedo, onFormat, onSelectAll,
            onToggleTheme, onToggleWrap } = this.options;

    // New file
    const newBtn = this.el.querySelector<HTMLButtonElement>('#tb-new');
    if (newBtn) newBtn.addEventListener('click', () => onNew?.());

    // Save file
    const saveBtn = this.el.querySelector<HTMLButtonElement>('#tb-save');
    if (saveBtn) saveBtn.addEventListener('click', () => onSave?.());

    // Open file
    const openBtn = this.el.querySelector<HTMLButtonElement>('#tb-open')!;
    openBtn.addEventListener('click', () => {
      import('../import/file-loader').then(({ openFilePicker }) => {
        openFilePicker({
          accept: '.bax',
          onLoad: (result) => {
            log.debug(`Opened file: ${result.filename}`);
            onLoad(result.filename, result.content);
            this.setStatus(`Opened ${result.filename}`, 'success');
          },
          onError: (err) => {
            log.error('Open file error:', err);
            this.setStatus('Failed to open file', 'error');
          },
        });
      }).catch((err) => {
        log.error('Failed to load file-loader module:', err);
      });
    });

    // Examples two-column panel
    const examplesBtn  = this.el.querySelector<HTMLButtonElement>('#tb-examples-btn')!;
    const examplesPanel = this.el.querySelector<HTMLElement>('#tb-examples-panel')!;
    let examplesPanelReady = false;

    const buildExamplesPanel = () => {
      if (examplesPanelReady) return;
      examplesPanelReady = true;

      // Left column: chip group buttons
      const leftCol = document.createElement('ul');
      leftCol.className = 'bb-examples-panel__groups';
      leftCol.setAttribute('role', 'listbox');
      leftCol.setAttribute('aria-label', 'Chip groups');

      // Right column: song list for the active group
      const rightCol = document.createElement('ul');
      rightCol.className = 'bb-examples-panel__songs';
      rightCol.setAttribute('role', 'listbox');
      rightCol.setAttribute('aria-label', 'Songs');

      const showGroup = (groupIndex: number) => {
        // Update active state on group buttons
        leftCol.querySelectorAll<HTMLElement>('.bb-examples-panel__group-btn').forEach((el, i) => {
          el.classList.toggle('bb-examples-panel__group-btn--active', i === groupIndex);
          el.setAttribute('aria-selected', String(i === groupIndex));
        });
        // Populate song list
        rightCol.innerHTML = '';
        const group = EXAMPLE_SONG_GROUPS[groupIndex];
        for (const song of group.songs) {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.className = 'bb-examples-panel__song-btn';
          btn.textContent = song.label;
          btn.title = song.label;
          btn.dataset.example = song.path;
          li.appendChild(btn);
          rightCol.appendChild(li);
        }
      };

      EXAMPLE_SONG_GROUPS.forEach((group, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'bb-examples-panel__group-btn';
        btn.textContent = group.group;
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', 'false');
        btn.addEventListener('click', () => showGroup(i));
        btn.addEventListener('mouseenter', () => showGroup(i));
        li.appendChild(btn);
        leftCol.appendChild(li);
      });

      examplesPanel.appendChild(leftCol);
      examplesPanel.appendChild(rightCol);

      // Default to first group
      showGroup(0);

      // Song click handler
      rightCol.addEventListener('click', async (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-example]');
        if (!btn) return;
        const path = btn.dataset.example!;
        examplesPanel.hidden = true;
        examplesBtn.setAttribute('aria-expanded', 'false');

        const cached = this.exampleCache.get(path);
        if (cached !== undefined) {
          const filename = path.split('/').pop() || 'example.bax';
          onLoad(filename, cached);
          this.setStatus(`Loaded ${filename}`, 'success');
          return;
        }

        this.setStatus('Loading...', 'info');
        try {
          const result = await loadRemote(path);
          const filename = path.split('/').pop() || 'example.bax';
          this.exampleCache.set(path, result.content);
          onLoad(filename, result.content);
          this.setStatus(`Loaded ${filename}`, 'success');
        } catch (err: any) {
          log.error('Failed to load example:', err);
          this.setStatus(`Failed to load: ${err.message}`, 'error');
        }
      });
    };

    examplesBtn.addEventListener('click', () => {
      const wasHidden = examplesPanel.hidden;
      examplesPanel.hidden = !wasHidden;
      examplesBtn.setAttribute('aria-expanded', String(!examplesPanel.hidden));
      if (wasHidden) {
        buildExamplesPanel();
        if (this.exampleCache.size === 0) this.prefetchExamples();
      }
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!examplesBtn.contains(e.target as Node) && !examplesPanel.contains(e.target as Node)) {
        examplesPanel.hidden = true;
        examplesBtn.setAttribute('aria-expanded', 'false');
      }
    }, { signal: this.abortController.signal });

    // Close the examples panel with Escape
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!examplesPanel.hidden) {
          examplesPanel.hidden = true;
          examplesBtn.setAttribute('aria-expanded', 'false');
          try { examplesBtn.focus(); } catch { /* ignore */ }
          e.stopPropagation();
          e.preventDefault();
        }
      }
    }, { signal: this.abortController.signal });

    // Export buttons
    const exportBtns = this.el.querySelectorAll<HTMLButtonElement>('[data-format]');
    exportBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.dataset.format as ExportFormat;
        log.debug(`Export requested: ${format}`);
        onExport(format);
      });
    });

    // Verify button
    const verifyBtn = this.el.querySelector<HTMLButtonElement>('#tb-verify');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', () => {
        if (onVerify) onVerify();
      });
    }

    // Undo / Redo / Format / Select All
    const undoBtn = this.el.querySelector<HTMLButtonElement>('#tb-undo');
    if (undoBtn) undoBtn.addEventListener('click', () => onUndo?.());
    const redoBtn = this.el.querySelector<HTMLButtonElement>('#tb-redo');
    if (redoBtn) redoBtn.addEventListener('click', () => onRedo?.());
    const formatBtn = this.el.querySelector<HTMLButtonElement>('#tb-format');
    if (formatBtn) formatBtn.addEventListener('click', () => onFormat?.());
    const selectAllBtn = this.el.querySelector<HTMLButtonElement>('#tb-selectall');
    if (selectAllBtn) selectAllBtn.addEventListener('click', () => onSelectAll?.());

    // Theme toggle
    this._themeToggleBtn = this.el.querySelector<HTMLButtonElement>('#tb-theme') ?? undefined;
    if (this._themeToggleBtn) {
      this._themeToggleBtn.addEventListener('click', () => onToggleTheme?.());
    }

    // Wrap toggle
    this._wrapToggleBtn = this.el.querySelector<HTMLButtonElement>('#tb-wrap') ?? undefined;
    if (this._wrapToggleBtn) {
      this._wrapToggleBtn.addEventListener('click', () => {
        this._wrapEnabled = !this._wrapEnabled;
        this.setWrapActive(this._wrapEnabled);
        onToggleWrap?.(this._wrapEnabled);
      });
    }

    // Listen for export events to show status
    const onExportStarted = (data: any) => {
      this.setStatus(`Exporting ${data.format?.toUpperCase() ?? ''}...`, 'info');
    };
    const onExportSuccess = (data: any) => {
      this.setStatus(`Exported ${data.filename ?? data.format}`, 'success');
    };
    const onExportError = (data: any) => {
      this.setStatus(`Export failed: ${data.error?.message ?? 'Unknown error'}`, 'error');
    };

    eventBus.on('export:started', onExportStarted);
    eventBus.on('export:success', onExportSuccess);
    eventBus.on('export:error', onExportError);

    // Remove EventBus subscriptions when the toolbar is disposed
    this.abortController.signal.addEventListener('abort', () => {
      eventBus.off('export:started', onExportStarted);
      eventBus.off('export:success', onExportSuccess);
      eventBus.off('export:error', onExportError);
    });

    // Keyboard shortcut: Ctrl+O → open file
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        openBtn.click();
      }
    }, { signal: this.abortController.signal });
  }

  /** Update the theme toggle button to reflect the current theme. */
  setThemeIcon(theme: 'dark' | 'light'): void {
    if (!this._themeToggleBtn) return;
    const isDark = theme === 'dark';
    this._themeToggleBtn.innerHTML = isDark
      ? `${icon('sun',  'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Light</span>`
      : `${icon('moon', 'w-4 h-4 inline-block align-text-bottom')} <span class="bb-toolbar__btn-label">Dark</span>`;
    this._themeToggleBtn.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  }

  /** Set the active state of the word-wrap toggle. */
  setWrapActive(wrap: boolean): void {
    this._wrapEnabled = wrap;
    this._wrapToggleBtn?.classList.toggle('bb-toolbar__btn--active', wrap);
  }

  /** Switch between icons+labels and icons-only display style. */
  setStyle(style: 'icons+labels' | 'icons'): void {
    this.el.setAttribute('data-style', style);
  }

  /**
   * Remove all document-level event listeners and EventBus subscriptions.
   * Call this when the toolbar is unmounted or replaced (e.g. during HMR).
   */
  dispose(): void {
    this.abortController.abort();
    this.el.remove();
    this.exampleCache.clear();
    log.debug('Toolbar disposed');
  }

  /** Show the toolbar (if hidden) */
  show(): void {
    this.el.style.display = '';
  }

  /** Hide the toolbar */
  hide(): void {
    this.el.style.display = 'none';
  }

  /** Toggle toolbar visibility */
  toggle(): void {
    const cur = this.isVisible();
    if (cur) this.hide(); else this.show();
  }

  /** Whether toolbar is currently visible */
  isVisible(): boolean {
    return this.el.style.display !== 'none';
  }

  /**
   * Silently pre-fetch all example songs into the in-memory cache so that
   * clicking an item from the dropdown is instant (no HTTP round-trip).
   */
  private prefetchExamples(): void {
    for (const { path } of EXAMPLE_SONGS) {
      if (this.exampleCache.has(path)) continue;
      loadRemote(path)
        .then(result => {
          this.exampleCache.set(path, result.content);
          log.debug(`Pre-fetched example: ${path}`);
        })
        .catch(err => log.warn(`Pre-fetch failed for ${path}:`, err));
    }
  }

  /**
   * Show a brief status message in the toolbar
   */
  setStatus(message: string, type: 'info' | 'success' | 'error' | '' = ''): void {
    const statusEl = this.el.querySelector<HTMLElement>('#tb-status')!;
    statusEl.textContent = message;
    statusEl.dataset.type = type;

    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (statusEl.textContent === message) {
          statusEl.textContent = '';
          statusEl.dataset.type = '';
        }
      }, 3000);
    }
  }

  /**
   * Enable or disable all export buttons (e.g., when song fails to parse).
   *
   * The original title is preserved in `data-original-title` on first call so
   * that repeated calls to setExportEnabled(false) never double-append the
   * suffix, and re-enabling always restores the exact original text.
   */
  setExportEnabled(enabled: boolean): void {
    const btns = this.el.querySelectorAll<HTMLButtonElement>('[data-format]');
    btns.forEach(btn => {
      // Snapshot the original title the first time we touch it
      if (!btn.dataset.originalTitle) {
        btn.dataset.originalTitle = btn.title;
      }
      btn.disabled = !enabled;
      btn.title = enabled
        ? btn.dataset.originalTitle
        : `${btn.dataset.originalTitle} (parse first)`;
    });
  }

  /** Show/hide chip-specific export actions based on the current parsed chip. */
  setChip(chip: string): void {
    this.activeChip = (chip || 'gameboy').toLowerCase();
    const btns = this.el.querySelectorAll<HTMLButtonElement>('[data-format]');
    btns.forEach((btn) => {
      const supported = (btn.dataset.supportedChips || '*')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      const visible = supported.includes('*') || supported.includes(this.activeChip);
      btn.hidden = !visible;
    });
  }

}
