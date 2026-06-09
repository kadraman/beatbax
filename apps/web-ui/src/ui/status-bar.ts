/**
 * StatusBar - Displays status information at the bottom of the UI
 *
 * Subscribes exclusively to nanostores — no EventBus dependency.
 * Optional Panels dropdown and clickable diagnostic counts are wired via config callbacks.
 */

import { playbackStatus, playbackTimeLabel, playbackError } from '@beatbax/app-core/stores/playback.store';
import { editorDirty, parseStatus, parsedBpm, parsedChip, validationErrors, validationWarnings } from '@beatbax/app-core/stores/editor.store';
import { exportStatus, exportFormat } from '@beatbax/app-core/stores/ui.store';
import { icon } from '../utils/icons';
import {
  formatScaleContextStatusLabel,
  type ScaleContext,
} from '@beatbax/app-core/editor/scale-context';
import {
  buildPanelMenuEntries,
  PANEL_MENU_GROUP_LABELS,
  type PanelMenuId,
  type PanelMenuState,
} from './panels-menu';

export interface StatusBarConfig {
  container: HTMLElement;
  /** Show current document name and modified indicator (desktop). */
  showDocumentInfo?: boolean;
  /** Snapshot of panel visibility for the Panels menu. */
  getPanelMenuState?: () => PanelMenuState;
  /** Toggle or show a panel (mirrors View menu / panel:toggled wiring). */
  onPanelMenuToggle?: (id: PanelMenuId) => void;
  /** Open the Problems panel (clickable error/warning counts). */
  onShowProblems?: () => void;
}

export interface DocumentStatusInfo {
  name: string;
  path?: string | null;
}

export interface StatusInfo {
  line: number;
  column: number;
  warningCount: number;
  errorCount: number;
  bpm: number;
  chip: string;
  playbackTime: string;
  status: string;
}

/**
 * Manages status bar display
 */
export class StatusBar {
  private container: HTMLElement;
  private root!: HTMLElement;
  private statusTextEl!: HTMLElement;
  private cursorEl!: HTMLElement;
  private scaleSection!: HTMLElement;
  private scaleIconEl!: HTMLElement;
  private scaleTextEl!: HTMLElement;
  private errorsBtn!: HTMLButtonElement;
  private errorsCountEl!: HTMLElement;
  private warningsBtn!: HTMLButtonElement;
  private warningsCountEl!: HTMLElement;
  private chipEl!: HTMLElement;
  private panelsWrap!: HTMLElement;
  private panelsBtn!: HTMLButtonElement;
  private panelsMenu!: HTMLElement;
  private scaleContext: ScaleContext | null = null;
  private panelsMenuOpen = false;
  private abort = new AbortController();
  private getPanelMenuState?: () => PanelMenuState;
  private onPanelMenuToggle?: (id: PanelMenuId) => void;
  private onShowProblems?: () => void;
  private showDocumentInfo = false;
  private documentNameEl?: HTMLElement;
  private documentDirtyEl?: HTMLElement;
  private documentName = 'untitled.bax';
  private documentPath: string | null = null;
  private documentDirty = false;
  private info: StatusInfo = {
    line: 1,
    column: 1,
    warningCount: 0,
    errorCount: 0,
    bpm: 120,
    chip: 'gameboy',
    playbackTime: '0:00',
    status: 'Idle',
  };

  constructor(config: StatusBarConfig) {
    this.container = config.container;
    this.showDocumentInfo = config.showDocumentInfo ?? false;
    this.getPanelMenuState = config.getPanelMenuState;
    this.onPanelMenuToggle = config.onPanelMenuToggle;
    this.onShowProblems = config.onShowProblems;
    this.buildDom();
    this.attachPanelMenuListeners();
    this.setupStoreSubscriptions();
    this.render();
  }

  /** Update the displayed document name/path (desktop status bar). */
  setDocumentInfo(info: DocumentStatusInfo): void {
    if (!this.showDocumentInfo) return;
    this.documentName = info.name || 'untitled.bax';
    this.documentPath = info.path ?? null;
    this.renderDocumentInfo();
  }

  dispose(): void {
    this.abort.abort();
    this.root.remove();
  }

  setStatus(status: string): void {
    this.info.status = status;
    this.statusTextEl.textContent = status;
  }

  setCursorPosition(line: number, column: number): void {
    this.info.line = line;
    this.info.column = column;
    this.cursorEl.textContent = `Ln ${line}, Col ${column}`;
  }

  setScaleContext(ctx: ScaleContext | null): void {
    this.scaleContext = ctx;
    if (!ctx) {
      this.scaleSection.hidden = true;
      return;
    }
    const label = formatScaleContextStatusLabel(ctx);
    this.scaleSection.hidden = false;
    this.scaleSection.title = label.title;
    this.scaleTextEl.textContent = label.text;
  }

  updateInfo(partial: Partial<StatusInfo>): void {
    this.info = { ...this.info, ...partial };
    this.render();
  }

  /** Refresh Panels menu checkmarks (e.g. after panel:toggled). */
  refreshPanelsMenu(): void {
    if (this.panelsMenuOpen) this.renderPanelsMenu();
  }

  private buildDom(): void {
    this.root = document.createElement('div');
    this.root.className = 'status-bar';

    const diagnosticsGroup = document.createElement('div');
    diagnosticsGroup.className = 'status-section status-diagnostics';

    this.errorsBtn = document.createElement('button');
    this.errorsBtn.type = 'button';
    this.errorsBtn.className = 'status-section status-errors status-bar-clickable';
    this.errorsBtn.title = 'Show Problems';
    const errorsIcon = document.createElement('span');
    errorsIcon.className = 'status-icon';
    errorsIcon.innerHTML = icon('exclamation-circle', 'w-3.5 h-3.5 inline-block align-middle');
    this.errorsCountEl = document.createElement('span');
    this.errorsCountEl.className = 'status-count';
    this.errorsBtn.append(errorsIcon, this.errorsCountEl);

    this.warningsBtn = document.createElement('button');
    this.warningsBtn.type = 'button';
    this.warningsBtn.className = 'status-section status-warnings status-bar-clickable';
    this.warningsBtn.title = 'Show Problems';
    const warningsIcon = document.createElement('span');
    warningsIcon.className = 'status-icon';
    warningsIcon.innerHTML = icon('exclamation-triangle', 'w-3.5 h-3.5 inline-block align-middle');
    this.warningsCountEl = document.createElement('span');
    this.warningsCountEl.className = 'status-count';
    this.warningsBtn.append(warningsIcon, this.warningsCountEl);

    diagnosticsGroup.append(this.errorsBtn, this.warningsBtn);

    const mainSection = document.createElement('div');
    mainSection.className = 'status-section status-main';
    this.statusTextEl = document.createElement('span');
    this.statusTextEl.className = 'status-text';
    mainSection.appendChild(this.statusTextEl);

    const spacer = document.createElement('div');
    spacer.className = 'status-bar-spacer';
    spacer.setAttribute('aria-hidden', 'true');

    const cursorSection = document.createElement('div');
    cursorSection.className = 'status-section';
    this.cursorEl = document.createElement('span');
    this.cursorEl.className = 'status-label';
    cursorSection.appendChild(this.cursorEl);

    this.scaleSection = document.createElement('div');
    this.scaleSection.className = 'status-section status-scale-context';
    this.scaleIconEl = document.createElement('span');
    this.scaleIconEl.className = 'status-icon';
    this.scaleTextEl = document.createElement('span');
    this.scaleTextEl.className = 'status-label status-scale-text';
    this.scaleSection.append(this.scaleIconEl, this.scaleTextEl);
    this.scaleSection.hidden = true;

    const chipSection = document.createElement('div');
    chipSection.className = 'status-section';
    this.chipEl = document.createElement('span');
    this.chipEl.className = 'status-label';
    chipSection.appendChild(this.chipEl);

    this.panelsWrap = document.createElement('div');
    this.panelsWrap.className = 'status-section status-panels-wrap';
    this.panelsBtn = document.createElement('button');
    this.panelsBtn.type = 'button';
    this.panelsBtn.className = 'status-panels-btn';
    this.panelsBtn.title = 'Show or hide panels';
    this.panelsBtn.setAttribute('aria-haspopup', 'true');
    this.panelsBtn.setAttribute('aria-expanded', 'false');
    this.panelsBtn.textContent = 'Panels ▾';
    this.panelsMenu = document.createElement('div');
    this.panelsMenu.className = 'status-panels-menu';
    this.panelsMenu.hidden = true;
    this.panelsWrap.append(this.panelsBtn, this.panelsMenu);

    if (this.showDocumentInfo) {
      this.documentNameEl = document.createElement('span');
      this.documentNameEl.className = 'status-document-name';
      this.documentDirtyEl = document.createElement('span');
      this.documentDirtyEl.className = 'status-document-dirty';
      this.documentDirtyEl.textContent = 'Modified';

      const leftZone = document.createElement('div');
      leftZone.className = 'status-bar-zone status-bar-zone--left';
      leftZone.append(chipSection, diagnosticsGroup, mainSection);

      const centerZone = document.createElement('div');
      centerZone.className = 'status-bar-zone status-bar-zone--center';
      centerZone.appendChild(this.documentNameEl);

      const rightZone = document.createElement('div');
      rightZone.className = 'status-bar-zone status-bar-zone--right';
      rightZone.append(this.documentDirtyEl, cursorSection, this.scaleSection, this.panelsWrap);

      this.root.classList.add('status-bar--document');
      this.root.append(leftZone, centerZone, rightZone);
    } else {
      this.root.append(
        chipSection,
        diagnosticsGroup,
        mainSection,
        spacer,
        cursorSection,
        this.scaleSection,
        this.panelsWrap,
      );
    }

    this.container.appendChild(this.root);

    if (!this.getPanelMenuState || !this.onPanelMenuToggle) {
      this.panelsWrap.hidden = true;
    }
  }

  private attachPanelMenuListeners(): void {
    const signal = this.abort.signal;

    this.errorsBtn.addEventListener('click', () => this.onShowProblems?.(), { signal });
    this.warningsBtn.addEventListener('click', () => this.onShowProblems?.(), { signal });

    if (!this.getPanelMenuState || !this.onPanelMenuToggle) return;

    this.panelsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPanelsMenuOpen(!this.panelsMenuOpen);
    }, { signal });

    this.panelsMenu.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-panel-id]');
      if (!item || item.classList.contains('status-panels-menu__item--disabled')) return;
      const id = item.dataset.panelId as PanelMenuId | undefined;
      if (!id) return;
      this.onPanelMenuToggle?.(id);
      this.renderPanelsMenu();
    }, { signal });

    document.addEventListener('click', () => {
      if (this.panelsMenuOpen) this.setPanelsMenuOpen(false);
    }, { signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panelsMenuOpen) this.setPanelsMenuOpen(false);
    }, { signal });
  }

  private setPanelsMenuOpen(open: boolean): void {
    this.panelsMenuOpen = open;
    this.panelsMenu.hidden = !open;
    this.panelsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) this.renderPanelsMenu();
  }

  private renderPanelsMenu(): void {
    if (!this.getPanelMenuState) return;
    const entries = buildPanelMenuEntries(this.getPanelMenuState());
    this.panelsMenu.replaceChildren();

    let lastGroup: string | null = null;
    for (const entry of entries) {
      if (entry.group !== lastGroup) {
        lastGroup = entry.group;
        const heading = document.createElement('div');
        heading.className = 'status-panels-menu__heading';
        heading.textContent = PANEL_MENU_GROUP_LABELS[entry.group];
        this.panelsMenu.appendChild(heading);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'status-panels-menu__item';
      btn.dataset.panelId = entry.id;
      if (entry.disabled) btn.classList.add('status-panels-menu__item--disabled');
      if (entry.checked) btn.classList.add('status-panels-menu__item--checked');

      const label = document.createElement('span');
      label.className = 'status-panels-menu__label';
      label.textContent = `${entry.checked ? '☑' : '☐'} ${entry.label}`;

      const shortcut = document.createElement('span');
      shortcut.className = 'status-panels-menu__shortcut';
      shortcut.textContent = entry.shortcut ?? '';

      btn.append(label, shortcut);
      this.panelsMenu.appendChild(btn);
    }

    // Hide empty groups that were skipped entirely
    if (entries.length === 0) {
      this.panelsMenu.textContent = 'No panels available';
    }
  }

  private setupStoreSubscriptions(): void {
    if (this.showDocumentInfo) {
      this.documentDirty = editorDirty.get();
      editorDirty.listen((dirty) => {
        this.documentDirty = dirty;
        this.renderDocumentInfo();
      });
    }

    parseStatus.listen((status) => {
      switch (status) {
        case 'parsing': this.setStatus('Parsing...'); break;
        case 'success':
          if (this.info.status === 'Parsing...') this.setStatus('Idle');
          break;
        case 'error':
          this.setStatus('Parse error');
          break;
      }
    });

    parsedBpm.listen((bpm) => {
      this.info.bpm = bpm;
      this.chipEl.textContent = `Chip: ${this.info.chip}`;
    });

    parsedChip.listen((chip) => {
      this.info.chip = chip;
      this.chipEl.textContent = `Chip: ${chip}`;
    });

    validationErrors.listen(() => this.updateDiagnosticCounts());
    validationWarnings.listen((warnings) => {
      this.info.warningCount = warnings.length;
      this.updateDiagnosticCounts();
    });

    playbackStatus.listen((status) => {
      switch (status) {
        case 'playing': this.setStatus('Playing'); break;
        case 'stopped':
          this.info.playbackTime = '0:00';
          this.setStatus('Stopped');
          break;
        case 'paused': this.setStatus('Paused'); break;
      }
    });

    playbackTimeLabel.listen(() => { /* reserved for future status-bar time display */ });

    playbackError.listen((msg) => {
      this.updateDiagnosticCounts();
      if (msg !== null) this.setStatus('Playback error');
    });

    exportStatus.listen((status) => {
      const fmt = exportFormat.get();
      switch (status) {
        case 'exporting': this.setStatus(`Exporting ${fmt}...`); break;
        case 'success':
          this.setStatus(`Export ${fmt} successful`);
          setTimeout(() => this.setStatus('Idle'), 3000);
          break;
        case 'error': this.setStatus(`Export ${fmt} failed`); break;
      }
    });
  }

  private updateDiagnosticCounts(): void {
    const errorCount = validationErrors.get().length + (playbackError.get() !== null ? 1 : 0);
    const warningCount = validationWarnings.get().length;
    this.info.errorCount = errorCount;
    this.info.warningCount = warningCount;

    this.errorsCountEl.textContent = String(errorCount);
    this.warningsCountEl.textContent = String(warningCount);
    this.errorsBtn.classList.toggle('status-bar-clickable--empty', errorCount === 0);
    this.warningsBtn.classList.toggle('status-bar-clickable--empty', warningCount === 0);
  }

  private renderDocumentInfo(): void {
    if (!this.documentNameEl || !this.documentDirtyEl) return;
    this.documentNameEl.textContent = this.documentName;
    const pathHint = this.documentPath ?? 'Unsaved draft';
    this.documentNameEl.title = this.documentDirty
      ? `${pathHint} (modified)`
      : pathHint;
    this.documentDirtyEl.hidden = !this.documentDirty;
  }

  private render(): void {
    this.renderDocumentInfo();
    this.statusTextEl.textContent = this.info.status;
    this.cursorEl.textContent = `Ln ${this.info.line}, Col ${this.info.column}`;
    this.chipEl.textContent = `Chip: ${this.info.chip}`;
    this.scaleIconEl.innerHTML = icon('musical-note', 'w-3.5 h-3.5 inline-block align-middle');
    this.setScaleContext(this.scaleContext);
    this.updateDiagnosticCounts();
  }
}
