/**
 * Drag-and-drop handler - Accept dropped .bax and .uge files
 * Part of Phase 3: Export & Import
 */

import { createLogger } from '@beatbax/engine/util/logger';
import { readFileAsText } from './file-loader';

const log = createLogger('ui:drag-drop');

/**
 * Options for drag-drop handler
 */
export interface DragDropOptions {
  /** Accepted file extensions (e.g., ['.bax', '.uge']) */
  acceptedExtensions?: string[];
  /** Callback when a file is dropped and loaded */
  onDrop?: (filename: string, content: string) => void;
  /** Callback when an invalid file is dropped */
  onInvalidFile?: (filename: string, reason: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Whether to show a visual overlay during drag */
  showOverlay?: boolean;
}

/**
 * CSS class applied to target element during drag-over
 */
const DRAG_OVER_CLASS = 'drag-over';
const DRAG_OVERLAY_CLASS = 'drag-overlay';

/**
 * DragDropHandler - attaches drag-and-drop listeners to a target element
 */
export class DragDropHandler {
  private target: HTMLElement;
  private options: Required<DragDropOptions>;
  private overlay: HTMLElement | null = null;
  private dragCounter = 0;

  // Event listener references for cleanup
  private onDragEnter: (e: DragEvent) => void;
  private onDragLeave: (e: DragEvent) => void;
  private onDragOver: (e: DragEvent) => void;
  private onDrop: (e: DragEvent) => void;

  constructor(target: HTMLElement, options: DragDropOptions = {}) {
    this.target = target;
    this.options = {
      acceptedExtensions: options.acceptedExtensions ?? ['.bax', '.uge'],
      onDrop: options.onDrop ?? (() => {}),
      onInvalidFile: options.onInvalidFile ?? (() => {}),
      onError: options.onError ?? (() => {}),
      showOverlay: options.showOverlay ?? true,
    };

    // Bind handlers
    this.onDragEnter = this.handleDragEnter.bind(this);
    this.onDragLeave = this.handleDragLeave.bind(this);
    this.onDragOver = this.handleDragOver.bind(this);
    this.onDrop = this.handleDrop.bind(this);

    this.attach();
  }

  private attach(): void {
    this.target.addEventListener('dragenter', this.onDragEnter);
    this.target.addEventListener('dragleave', this.onDragLeave);
    this.target.addEventListener('dragover', this.onDragOver);
    this.target.addEventListener('drop', this.onDrop);
    log.debug('DragDropHandler attached to', this.target.id || this.target.tagName);
  }

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = DRAG_OVERLAY_CLASS;
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(86, 156, 214, 0.15);
      border: 2px dashed #569cd6;
      border-radius: 4px;
      pointer-events: none;
      font-size: 18px;
      color: #569cd6;
      font-weight: 600;
      gap: 8px;
    `;
    overlay.textContent = 'Drop .bax or .uge file to load';
    return overlay;
  }

  private showDragIndicator(): void {
    if (!this.options.showOverlay) return;

    // Ensure target has relative or absolute positioning
    const pos = getComputedStyle(this.target).position;
    if (pos === 'static') {
      this.target.style.position = 'relative';
    }

    this.target.classList.add(DRAG_OVER_CLASS);

    if (!this.overlay) {
      this.overlay = this.createOverlay();
      this.target.appendChild(this.overlay);
    }
  }

  private hideDragIndicator(): void {
    this.target.classList.remove(DRAG_OVER_CLASS);
    if (this.overlay) {
      try { this.target.removeChild(this.overlay); } catch {}
      this.overlay = null;
    }
  }

  private handleDragEnter(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragCounter++;
    if (this.dragCounter === 1) {
      this.showDragIndicator();
    }
  }

  private handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.hideDragIndicator();
    }
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  private async handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    e.stopPropagation();
    this.dragCounter = 0;
    this.hideDragIndicator();

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Process the first valid file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!this.options.acceptedExtensions.includes(ext)) {
        log.warn(`Dropped unsupported file: ${file.name}`);
        this.options.onInvalidFile(
          file.name,
          `Unsupported file type '${ext}'. Accepted: ${this.options.acceptedExtensions.join(', ')}`
        );
        continue;
      }

      try {
        const content = await readFileAsText(file);
        log.debug(`Dropped file loaded: ${file.name} (${file.size} bytes)`);
        this.options.onDrop(file.name, content);
        break; // Only process first valid file
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error('Drag-drop file read error:', error);
        this.options.onError(error);
      }
    }
  }

  /**
   * Remove all event listeners and clean up
   */
  dispose(): void {
    this.target.removeEventListener('dragenter', this.onDragEnter);
    this.target.removeEventListener('dragleave', this.onDragLeave);
    this.target.removeEventListener('dragover', this.onDragOver);
    this.target.removeEventListener('drop', this.onDrop);
    this.hideDragIndicator();
    log.debug('DragDropHandler disposed');
  }
}
