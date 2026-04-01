/**
 * Toolbar - Export controls and file open/save toolbar
 * Provides: Open, example songs, export format buttons, drag-and-drop trigger
 */

import type { EventBus } from '../utils/event-bus';
import type { ExportFormat } from '../export/export-manager';
import { EXAMPLE_SONGS, loadRemote } from '../import/remote-loader';
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
}

export class Toolbar {
  private el!: HTMLElement;
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
        <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-open" title="Open .bax file (Ctrl+O)">
          ${icon('folder-open', 'w-4 h-4 inline-block align-text-bottom')} Open
        </button>
        <div class="bb-toolbar__dropdown-wrap">
          <button class="bb-toolbar__btn bb-toolbar__btn--icon" id="tb-examples-btn" title="Load an example song">
            ${icon('musical-note', 'w-4 h-4 inline-block align-text-bottom')} Examples ${icon('chevron-down', 'w-3 h-3 inline-block align-middle')}
          </button>
          <ul class="bb-toolbar__dropdown" id="tb-examples-list" aria-label="Example songs" hidden>
            ${EXAMPLE_SONGS.map(s => `
              <li>
                <button class="bb-toolbar__dropdown-item" data-example="${s.path}" title="${s.label}">
                  ${s.label}
                </button>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>

      <div class="bb-toolbar__separator" aria-hidden="true"></div>

      <div class="bb-toolbar__group bb-toolbar__group--export">
        <span class="bb-toolbar__label">Export:</span>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="json" title="Export as JSON (ISM format)">
          ${icon('document', 'w-4 h-4 inline-block align-text-bottom')} JSON
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="midi" title="Export as MIDI (4-track Standard MIDI File)">
          ${icon('musical-note', 'w-4 h-4 inline-block align-text-bottom')} MIDI
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="uge" title="Export as UGE (hUGETracker v6)">
          ${icon('cpu-chip', 'w-4 h-4 inline-block align-text-bottom')} UGE
        </button>
        <button class="bb-toolbar__btn bb-toolbar__btn--export" data-format="wav" title="Export as WAV (rendered audio)">
          ${icon('speaker-wave', 'w-4 h-4 inline-block align-text-bottom')} WAV
        </button>
      </div>

      <div class="bb-toolbar__separator" aria-hidden="true"></div>

      <div class="bb-toolbar__group bb-toolbar__group--verify">
        <button class="bb-toolbar__btn" id="tb-verify" title="Validate the current song (Alt+V)">
          ${icon('check-circle', 'w-4 h-4 inline-block align-text-bottom')} Verify
        </button>
      </div>

      <div class="bb-toolbar__status" id="tb-status" aria-live="polite"></div>
    `;

    container.appendChild(this.el);
    this.injectStyles();
  }

  private attachEvents(): void {
    const { eventBus, onLoad, onExport, onVerify } = this.options;

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

    // Examples dropdown
    const examplesBtn = this.el.querySelector<HTMLButtonElement>('#tb-examples-btn')!;
    const examplesList = this.el.querySelector<HTMLElement>('#tb-examples-list')!;

    examplesBtn.addEventListener('click', () => {
      const hidden = examplesList.hidden;
      examplesList.hidden = !hidden;
      examplesBtn.setAttribute('aria-expanded', String(hidden));
      // Pre-fetch all examples into cache the first time the dropdown opens
      if (hidden && this.exampleCache.size === 0) {
        this.prefetchExamples();
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!examplesBtn.contains(e.target as Node) && !examplesList.contains(e.target as Node)) {
        examplesList.hidden = true;
        examplesBtn.setAttribute('aria-expanded', 'false');
      }
    }, { signal: this.abortController.signal });

    examplesList.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-example]');
      if (!btn) return;

      const path = btn.dataset.example!;
      examplesList.hidden = true;

      // Serve from cache if already pre-fetched; otherwise fetch now
      const cached = this.exampleCache.get(path);
      if (cached !== undefined) {
        const filename = path.split('/').pop() || 'example.bax';
        onLoad(filename, cached);
        this.setStatus(`Loaded ${filename}`, 'success');
        log.debug(`Loaded example from cache: ${path}`);
        return;
      }

      this.setStatus('Loading...', 'info');
      try {
        const result = await loadRemote(path);
        const filename = path.split('/').pop() || 'example.bax';
        this.exampleCache.set(path, result.content);
        onLoad(filename, result.content);
        this.setStatus(`Loaded ${filename}`, 'success');
        log.debug(`Loaded example: ${path}`);
      } catch (err: any) {
        log.error('Failed to load example:', err);
        this.setStatus(`Failed to load: ${err.message}`, 'error');
      }
    });

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

  private injectStyles(): void {
    if (document.getElementById('bb-toolbar-styles')) return;

    const style = document.createElement('style');
    style.id = 'bb-toolbar-styles';
    style.textContent = `
      .bb-toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: #252526;
        border-bottom: 1px solid #3c3c3c;
        flex-shrink: 0;
        flex-wrap: wrap;
        min-height: 36px;
        user-select: none;
      }

      .bb-toolbar__group {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .bb-toolbar__label {
        font-size: 11px;
        color: #888;
        margin-right: 2px;
        white-space: nowrap;
      }

      .bb-toolbar__separator {
        width: 1px;
        height: 20px;
        background: #3c3c3c;
        margin: 0 4px;
        flex-shrink: 0;
      }

      .bb-toolbar__btn {
        padding: 3px 8px;
        font-size: 12px;
        background: transparent;
        color: #cccccc;
        border: 1px solid transparent;
        border-radius: 3px;
        cursor: pointer;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: background 0.15s, border-color 0.15s;
      }

      .bb-toolbar__btn:hover:not(:disabled) {
        background: #2a2d2e;
        border-color: #3c3c3c;
        color: #ffffff;
      }

      .bb-toolbar__btn:active:not(:disabled) {
        background: #37373d;
      }

      .bb-toolbar__btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .bb-toolbar__btn--export {
        color: #9cdcfe;
      }

      .bb-toolbar__btn--export:hover:not(:disabled) {
        color: #ffffff;
        border-color: #569cd6;
      }

      .bb-toolbar__dropdown-wrap {
        position: relative;
      }

      .bb-toolbar__dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        background: #2d2d30;
        border: 1px solid #555;
        border-radius: 4px;
        list-style: none;
        min-width: 180px;
        z-index: 1000;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        padding: 4px 0;
      }

      .bb-toolbar__dropdown[hidden] {
        display: none;
      }

      .bb-toolbar__dropdown-item {
        display: block;
        width: 100%;
        padding: 6px 12px;
        font-size: 12px;
        background: transparent;
        color: #cccccc;
        border: none;
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bb-toolbar__dropdown-item:hover {
        background: #3e3e42;
        color: #ffffff;
      }

      .bb-toolbar__status {
        margin-left: auto;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #888;
        transition: color 0.2s;
      }

      .bb-toolbar__status[data-type="success"] {
        color: #4ec9b0;
      }

      .bb-toolbar__status[data-type="error"] {
        color: #f48771;
      }

      .bb-toolbar__status[data-type="info"] {
        color: #9cdcfe;
      }

      /* ── Light theme overrides ── */
      [data-theme="light"] .bb-toolbar {
        background: var(--bb-toolbar-bg, #f3f3f3);
        border-bottom-color: var(--bb-toolbar-border, #ddd);
      }
      [data-theme="light"] .bb-toolbar__label {
        color: var(--bb-toolbar-label-fg, #666);
      }
      [data-theme="light"] .bb-toolbar__separator {
        background: var(--bb-toolbar-separator, #ddd);
      }
      [data-theme="light"] .bb-toolbar__btn {
        color: var(--bb-toolbar-fg, #333);
      }
      [data-theme="light"] .bb-toolbar__btn:hover:not(:disabled) {
        background: var(--bb-toolbar-btn-hover-bg, #e4e4e4);
        border-color: var(--bb-toolbar-btn-hover-border, #ccc);
        color: #111;
      }
      [data-theme="light"] .bb-toolbar__btn:active:not(:disabled) {
        background: var(--bb-toolbar-btn-active-bg, #d8d8d8);
      }
      [data-theme="light"] .bb-toolbar__btn--export {
        color: #0366d6;
      }
      [data-theme="light"] .bb-toolbar__btn--export:hover:not(:disabled) {
        color: #003080;
        border-color: #0366d6;
      }
      [data-theme="light"] .bb-toolbar__dropdown {
        background: var(--bb-toolbar-dropdown-bg, #fff);
        border-color: var(--bb-toolbar-dropdown-border, #ccc);
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      }
      [data-theme="light"] .bb-toolbar__dropdown-item {
        color: var(--bb-toolbar-dropdown-fg, #333);
      }
      [data-theme="light"] .bb-toolbar__dropdown-item:hover {
        background: var(--bb-toolbar-dropdown-hover-bg, #e9e9e9);
        color: var(--bb-toolbar-dropdown-hover-fg, #111);
      }
      [data-theme="light"] .bb-toolbar__status {
        color: var(--bb-toolbar-status-fg, #666);
      }
      [data-theme="light"] .bb-toolbar__status[data-type="success"] {
        color: #1a7a4c;
      }
      [data-theme="light"] .bb-toolbar__status[data-type="error"] {
        color: #d73a49;
      }
      [data-theme="light"] .bb-toolbar__status[data-type="info"] {
        color: #0366d6;
      }
    `;
    document.head.appendChild(style);
  }
}
