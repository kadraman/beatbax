/**
 * Layout manager with resizable split panes
 * Manages editor + output panel split layout
 * Pure vanilla JS implementation (no React required)
 */

import { eventBus } from '../utils/event-bus';

export interface LayoutConfig {
  /** Container element */
  container: HTMLElement;
  /** Initial size of editor pane (percentage or pixels) */
  editorSize?: number;
  /** Initial size of output pane (percentage or pixels) */
  outputSize?: number;
  /** Minimum size of panes */
  minSize?: number;
  /** Persist sizes to localStorage */
  persist?: boolean;
  /** LocalStorage key for persisting */
  storageKey?: string;
}

export interface LayoutManager {
  /** The container element */
  container: HTMLElement;
  /** Get editor pane element */
  getEditorPane: () => HTMLElement;
  /** Get output pane element */
  getOutputPane: () => HTMLElement;
  /** Reset to default layout */
  reset: () => void;
  /** Dispose the layout manager */
  dispose: () => void;
  /** Save current sizes to localStorage */
  saveSizes: () => void;
  /** Load sizes from localStorage */
  loadSizes: () => void;
}

const DEFAULT_STORAGE_KEY = 'beatbax-layout-sizes';

/**
 * Create a layout manager with resizable split panes
 * Vanilla JS implementation with draggable splitter
 */
export function createLayout(config: LayoutConfig): LayoutManager {
  const {
    container,
    editorSize = 70, // 70% for editor by default
    outputSize = 30, // 30% for output by default
    minSize = 100,
    persist = true,
    storageKey = DEFAULT_STORAGE_KEY,
  } = config;

  // Load saved sizes if persistence is enabled
  let currentEditorSize = editorSize;

  if (persist) {
    try {
      const savedSizes = localStorage.getItem(storageKey);
      if (savedSizes) {
        const sizes = JSON.parse(savedSizes);
        if (sizes.editor !== undefined) currentEditorSize = sizes.editor;
      }
    } catch (e) {
      console.warn('Failed to load layout sizes from localStorage:', e);
    }
  }

  // Create split container
  const splitContainer = document.createElement('div');
  splitContainer.style.display = 'flex';
  splitContainer.style.width = '100%';
  splitContainer.style.height = '100%';
  splitContainer.style.overflow = 'hidden';

  // Create editor pane
  const editorPane = document.createElement('div');
  editorPane.id = 'editor-pane';
  editorPane.style.width = `${currentEditorSize}%`;
  editorPane.style.height = '100%';
  editorPane.style.overflow = 'hidden';
  editorPane.style.position = 'relative';

  // Create splitter
  const splitter = document.createElement('div');
  splitter.style.width = '4px';
  splitter.style.height = '100%';
  splitter.style.backgroundColor = '#333';
  splitter.style.cursor = 'col-resize';
  splitter.style.flexShrink = '0';
  splitter.style.transition = 'background-color 0.2s';

  splitter.addEventListener('mouseenter', () => {
    splitter.style.backgroundColor = '#007acc';
  });

  splitter.addEventListener('mouseleave', () => {
    splitter.style.backgroundColor = '#333';
  });

  // Create output pane
  const outputPane = document.createElement('div');
  outputPane.id = 'output-pane';
  outputPane.style.flex = '1';
  outputPane.style.height = '100%';
  outputPane.style.overflow = 'auto';
  outputPane.style.backgroundColor = '#1e1e1e';
  outputPane.style.color = '#d4d4d4';
  outputPane.style.padding = '10px';
  outputPane.style.fontFamily = 'monospace';
  outputPane.style.fontSize = '12px';

  // Assemble layout
  splitContainer.appendChild(editorPane);
  splitContainer.appendChild(splitter);
  splitContainer.appendChild(outputPane);
  container.appendChild(splitContainer);

  // Dragging logic
  let isDragging = false;

  splitter.addEventListener('mousedown', (e) => {
    isDragging = true;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const containerRect = splitContainer.getBoundingClientRect();
    const newEditorWidth = e.clientX - containerRect.left;
    const containerWidth = containerRect.width;

    // Enforce minimum sizes
    if (newEditorWidth < minSize || containerWidth - newEditorWidth < minSize) {
      return;
    }

    const newEditorPercent = (newEditorWidth / containerWidth) * 100;
    currentEditorSize = newEditorPercent;
    editorPane.style.width = `${newEditorPercent}%`;

    // Trigger resize events for editor
    window.dispatchEvent(new Event('resize'));
  };

  const handleMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveSizes();
    }
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // Save function
  function saveSizes() {
    if (!persist) return;

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          editor: currentEditorSize,
          output: 100 - currentEditorSize,
        })
      );
      eventBus.emit('layout:changed', { layout: 'editor-output' });
    } catch (e) {
      console.warn('Failed to save layout sizes to localStorage:', e);
    }
  }

  // Load function
  function loadSizes() {
    if (!persist) return;

    try {
      const savedSizes = localStorage.getItem(storageKey);
      if (savedSizes) {
        const sizes = JSON.parse(savedSizes);
        if (sizes.editor !== undefined) {
          currentEditorSize = sizes.editor;
          editorPane.style.width = `${currentEditorSize}%`;
        }
      }
    } catch (e) {
      console.warn('Failed to load layout sizes from localStorage:', e);
    }
  }

  // Reset function
  function reset() {
    currentEditorSize = editorSize;
    editorPane.style.width = `${editorSize}%`;
    if (persist) {
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.warn('Failed to remove layout sizes from localStorage:', e);
      }
    }
    eventBus.emit('layout:changed', { layout: 'reset' });
  }

  return {
    container: splitContainer,
    getEditorPane: () => editorPane,
    getOutputPane: () => outputPane,
    reset,
    dispose: () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      container.removeChild(splitContainer);
    },
    saveSizes,
    loadSizes,
  };
}

/**
 * Create output panel content structure
 */
export function createOutputPanelContent(container: HTMLElement): {
  errorsPanel: HTMLElement;
  warningsPanel: HTMLElement;
  clearErrors: () => void;
  clearWarnings: () => void;
  showError: (message: string, loc?: any) => void;
  showWarning: (component: string, message: string, loc?: any) => void;
} {
  // Create sections
  const errorsPanel = document.createElement('div');
  errorsPanel.id = 'errors-panel';
  errorsPanel.style.marginBottom = '16px';
  errorsPanel.style.display = 'none';

  const errorsTitle = document.createElement('div');
  errorsTitle.textContent = '❌ Errors';
  errorsTitle.style.fontWeight = 'bold';
  errorsTitle.style.color = '#f48771';
  errorsTitle.style.marginBottom = '8px';
  errorsPanel.appendChild(errorsTitle);

  const errorsList = document.createElement('div');
  errorsList.id = 'errors-list';
  errorsList.style.paddingLeft = '16px';
  errorsPanel.appendChild(errorsList);

  const clearErrorsBtn = document.createElement('button');
  clearErrorsBtn.textContent = 'Clear Errors';
  clearErrorsBtn.style.marginTop = '8px';
  errorsPanel.appendChild(clearErrorsBtn);

  const warningsPanel = document.createElement('div');
  warningsPanel.id = 'warnings-panel';
  warningsPanel.style.marginBottom = '16px';
  warningsPanel.style.display = 'none';

  const warningsTitle = document.createElement('div');
  warningsTitle.textContent = '⚠️ Warnings';
  warningsTitle.style.fontWeight = 'bold';
  warningsTitle.style.color = '#cca700';
  warningsTitle.style.marginBottom = '8px';
  warningsPanel.appendChild(warningsTitle);

  const warningsList = document.createElement('div');
  warningsList.id = 'warnings-list';
  warningsList.style.paddingLeft = '16px';
  warningsPanel.appendChild(warningsList);

  const clearWarningsBtn = document.createElement('button');
  clearWarningsBtn.textContent = 'Clear Warnings';
  clearWarningsBtn.style.marginTop = '8px';
  warningsPanel.appendChild(clearWarningsBtn);

  // Add to container
  container.appendChild(errorsPanel);
  container.appendChild(warningsPanel);

  // Functions
  function clearErrors() {
    errorsPanel.style.display = 'none';
    errorsList.innerHTML = '';
  }

  function clearWarnings() {
    warningsPanel.style.display = 'none';
    warningsList.innerHTML = '';
  }

  function showError(message: string, loc?: any) {
    errorsPanel.style.display = 'block';
    const div = document.createElement('div');
    div.style.marginBottom = '4px';

    let locStr = '';
    if (loc && loc.start) {
      const line = loc.start.line;
      const col = loc.start.column || 0;
      locStr = ` (line ${line}, col ${col})`;
    }

    div.textContent = `${message}${locStr}`;
    errorsList.appendChild(div);
  }

  function showWarning(component: string, message: string, loc?: any) {
    warningsPanel.style.display = 'block';
    const div = document.createElement('div');
    div.style.marginBottom = '4px';

    let locStr = '';
    if (loc && loc.start) {
      const line = loc.start.line;
      const col = loc.start.column || 0;
      locStr = ` (line ${line}, col ${col})`;
    }

    div.textContent = `[${component}] ${message}${locStr}`;
    warningsList.appendChild(div);
  }

  // Event handlers
  clearErrorsBtn.addEventListener('click', clearErrors);
  clearWarningsBtn.addEventListener('click', clearWarnings);

  // Subscribe to EventBus
  eventBus.on('validation:errors', ({ errors }) => {
    clearErrors();
    errors.forEach((err) => showError(err.message, err.loc));
  });

  eventBus.on('validation:warnings', ({ warnings }) => {
    clearWarnings();
    warnings.forEach((w) => showWarning(w.component, w.message, w.loc));
  });

  return {
    errorsPanel,
    warningsPanel,
    clearErrors,
    clearWarnings,
    showError,
    showWarning,
  };
}
