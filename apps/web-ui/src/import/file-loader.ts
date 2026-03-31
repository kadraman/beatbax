/**
 * File loader - Load .bax files from disk
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:file-loader');

/**
 * Result of a file load operation
 */
export interface FileLoadResult {
  filename: string;
  content: string;
  size: number;
  type?: string;
}

/**
 * Options for file loading
 */
export interface FileLoaderOptions {
  /** Accepted file types (e.g., '.bax,.uge') */
  accept?: string;
  /** Callback when a file is loaded */
  onLoad?: (result: FileLoadResult) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Read a File object as text
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Read a File object as binary (ArrayBuffer)
 */
export async function readFileAsBinary(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
      } else {
        reject(new Error('FileReader did not return an ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Open a file picker dialog and load a .bax file
 */
export function openFilePicker(options: FileLoaderOptions = {}): void {
  const accept = options.accept || '.bax,.uge';

  // Create a hidden file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  document.body.appendChild(input);

  // Track whether the change handler already cleaned up so the cancel path
  // does not attempt a second removeChild.
  let settled = false;

  function cleanup() {
    if (settled) return;
    settled = true;
    if (input.parentNode) {
      document.body.removeChild(input);
    }
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) {
      cleanup();
      return;
    }

    try {
      const content = await readFileAsText(file);
      log.debug(`Loaded file: ${file.name} (${file.size} bytes)`);

      options.onLoad?.({
        filename: file.name,
        content,
        size: file.size,
        type: file.type || 'text/plain',
      });
    } catch (err) {
      log.error('File load error:', err);
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      cleanup();
    }
  });

  // When the picker closes without a selection the browser returns focus to
  // the window.  We use a one-time focus listener as the cancel signal.
  // A short setTimeout is needed because some browsers fire focus before the
  // input's change event on successful selection; the delay lets change win.
  const onWindowFocus = () => {
    setTimeout(() => cleanup(), 300);
  };
  window.addEventListener('focus', onWindowFocus, { once: true });

  // Trigger the picker
  input.click();
}

/**
 * Load a .bax file from a FileList (e.g., from an existing file input)
 */
export async function loadFromFileList(
  files: FileList,
  acceptedExtensions: string[] = ['.bax', '.uge', '.txt']
): Promise<FileLoadResult[]> {
  const results: FileLoadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!acceptedExtensions.includes(ext)) {
      log.warn(`Skipping unsupported file type: ${file.name}`);
      continue;
    }

    try {
      const content = await readFileAsText(file);
      results.push({
        filename: file.name,
        content,
        size: file.size,
        type: file.type,
      });
    } catch (err) {
      log.error(`Failed to read ${file.name}:`, err);
    }
  }

  return results;
}

/**
 * FileLoader class - manages file loading with an event-based API
 */
export class FileLoader {
  private options: FileLoaderOptions;

  constructor(options: FileLoaderOptions = {}) {
    this.options = options;
  }

  /**
   * Open the OS file picker to select a .bax file
   */
  open(): void {
    openFilePicker(this.options);
  }

  /**
   * Load from an HTML input[type=file] element's change event
   */
  async loadFromInput(input: HTMLInputElement): Promise<FileLoadResult | null> {
    const file = input.files?.[0];
    if (!file) return null;

    try {
      const content = await readFileAsText(file);
      const result: FileLoadResult = {
        filename: file.name,
        content,
        size: file.size,
        type: file.type,
      };
      this.options.onLoad?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      return null;
    }
  }
}
