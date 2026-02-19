/**
 * Layout manager with resizable split panes
 * Manages editor + output panel split layout
 * Pure vanilla JS implementation (no React required)
 */

import { eventBus } from '../utils/event-bus';
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:layout');

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

export interface ThreePaneLayoutManager extends LayoutManager {
  /** Get the right panel element (for channel controls) */
  getRightPane: () => HTMLElement;
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
      log.warn('Failed to load layout sizes from localStorage:', e);
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
      log.warn('Failed to save layout sizes to localStorage:', e);
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
      log.warn('Failed to load layout sizes from localStorage:', e);
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
        log.warn('Failed to remove layout sizes from localStorage:', e);
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

/**
 * Create a three-pane layout with resizable splits:
 * - Left content area (vertical split): Editor (top) + Output (bottom)
 * - Right panel: Channel controls
 * - Horizontal splitter between left and right
 */
export function createThreePaneLayout(config: LayoutConfig): ThreePaneLayoutManager {
  const {
    container,
    minSize = 100,
    persist = true,
    storageKey = 'beatbax-layout-3pane',
  } = config;

  // Default sizes
  let leftAreaWidth = 75; // 75% for left area (editor + output)
  let editorHeight = 70;  // 70% for editor within left area

  // Load saved sizes if persistence is enabled
  if (persist) {
    try {
      const savedSizes = localStorage.getItem(storageKey);
      if (savedSizes) {
        const sizes = JSON.parse(savedSizes);
        if (sizes.leftArea !== undefined) leftAreaWidth = sizes.leftArea;
        if (sizes.editor !== undefined) editorHeight = sizes.editor;
      }
    } catch (e) {
      log.warn('Failed to load 3-pane layout sizes:', e);
    }
  }

  // Create main horizontal container
  const mainContainer = document.createElement('div');
  mainContainer.style.display = 'flex';
  mainContainer.style.width = '100%';
  mainContainer.style.height = '100%';
  mainContainer.style.overflow = 'hidden';

  // ========== LEFT CONTENT AREA (will contain editor + output vertically) ==========
  const leftContentArea = document.createElement('div');
  leftContentArea.style.width = `${leftAreaWidth}%`;
  leftContentArea.style.height = '100%';
  leftContentArea.style.display = 'flex';
  leftContentArea.style.flexDirection = 'column';
  leftContentArea.style.overflow = 'hidden';

  // Editor pane (top of left area)
  const editorPane = document.createElement('div');
  editorPane.id = 'editor-pane';
  editorPane.style.height = `${editorHeight}%`;
  editorPane.style.width = '100%';
  editorPane.style.overflow = 'hidden';
  editorPane.style.position = 'relative';

  // Vertical splitter (between editor and output)
  const verticalSplitter = document.createElement('div');
  verticalSplitter.style.height = '4px';
  verticalSplitter.style.width = '100%';
  verticalSplitter.style.backgroundColor = '#333';
  verticalSplitter.style.cursor = 'row-resize';
  verticalSplitter.style.flexShrink = '0';
  verticalSplitter.style.transition = 'background-color 0.2s';

  verticalSplitter.addEventListener('mouseenter', () => {
    verticalSplitter.style.backgroundColor = '#007acc';
  });

  verticalSplitter.addEventListener('mouseleave', () => {
    verticalSplitter.style.backgroundColor = '#333';
  });

  // Output pane (bottom of left area)
  const outputPane = document.createElement('div');
  outputPane.id = 'output-pane';
  outputPane.style.flex = '1';
  outputPane.style.width = '100%';
  outputPane.style.overflow = 'auto';
  outputPane.style.backgroundColor = '#1e1e1e';
  outputPane.style.color = '#d4d4d4';
  outputPane.style.padding = '10px';
  outputPane.style.fontFamily = 'monospace';
  outputPane.style.fontSize = '12px';

  // Assemble left content area
  leftContentArea.appendChild(editorPane);
  leftContentArea.appendChild(verticalSplitter);
  leftContentArea.appendChild(outputPane);

  // ========== HORIZONTAL SPLITTER (between left and right) ==========
  const horizontalSplitter = document.createElement('div');
  horizontalSplitter.style.width = '4px';
  horizontalSplitter.style.height = '100%';
  horizontalSplitter.style.backgroundColor = '#333';
  horizontalSplitter.style.cursor = 'col-resize';
  horizontalSplitter.style.flexShrink = '0';
  horizontalSplitter.style.transition = 'background-color 0.2s';

  horizontalSplitter.addEventListener('mouseenter', () => {
    horizontalSplitter.style.backgroundColor = '#007acc';
  });

  horizontalSplitter.addEventListener('mouseleave', () => {
    horizontalSplitter.style.backgroundColor = '#333';
  });

  // ========== RIGHT PANEL (channel controls) ==========
  const rightPane = document.createElement('div');
  rightPane.id = 'right-pane';
  rightPane.style.flex = '1';
  rightPane.style.height = '100%';
  rightPane.style.overflow = 'auto';
  rightPane.style.backgroundColor = '#252525';
  rightPane.style.padding = '10px';

  // Assemble main layout
  mainContainer.appendChild(leftContentArea);
  mainContainer.appendChild(horizontalSplitter);
  mainContainer.appendChild(rightPane);
  container.appendChild(mainContainer);

  // ========== VERTICAL DRAGGING LOGIC (editor/output split) ==========
  let isVerticalDragging = false;

  verticalSplitter.addEventListener('mousedown', (e) => {
    isVerticalDragging = true;
    e.preventDefault();
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  const handleVerticalMouseMove = (e: MouseEvent) => {
    if (!isVerticalDragging) return;

    const containerRect = leftContentArea.getBoundingClientRect();
    const newEditorHeight = e.clientY - containerRect.top;
    const containerHeight = containerRect.height;

    // Enforce minimum sizes
    if (newEditorHeight < minSize || containerHeight - newEditorHeight < minSize) {
      return;
    }

    const newEditorPercent = (newEditorHeight / containerHeight) * 100;
    editorHeight = newEditorPercent;
    editorPane.style.height = `${newEditorPercent}%`;

    // Trigger resize events for editor
    window.dispatchEvent(new Event('resize'));
  };

  const handleVerticalMouseUp = () => {
    if (isVerticalDragging) {
      isVerticalDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveSizes();
    }
  };

  // ========== HORIZONTAL DRAGGING LOGIC (left/right split) ==========
  let isHorizontalDragging = false;

  horizontalSplitter.addEventListener('mousedown', (e) => {
    isHorizontalDragging = true;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  const handleHorizontalMouseMove = (e: MouseEvent) => {
    if (!isHorizontalDragging) return;

    const containerRect = mainContainer.getBoundingClientRect();
    const newLeftWidth = e.clientX - containerRect.left;
    const containerWidth = containerRect.width;

    // Enforce minimum sizes
    if (newLeftWidth < minSize || containerWidth - newLeftWidth < minSize) {
      return;
    }

    const newLeftPercent = (newLeftWidth / containerWidth) * 100;
    leftAreaWidth = newLeftPercent;
    leftContentArea.style.width = `${newLeftPercent}%`;

    // Trigger resize events for editor
    window.dispatchEvent(new Event('resize'));
  };

  const handleHorizontalMouseUp = () => {
    if (isHorizontalDragging) {
      isHorizontalDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveSizes();
    }
  };

  // Register mouse event handlers
  document.addEventListener('mousemove', handleVerticalMouseMove);
  document.addEventListener('mousemove', handleHorizontalMouseMove);
  document.addEventListener('mouseup', handleVerticalMouseUp);
  document.addEventListener('mouseup', handleHorizontalMouseUp);

  // Save function
  function saveSizes() {
    if (!persist) return;

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          leftArea: leftAreaWidth,
          editor: editorHeight,
        })
      );
      eventBus.emit('layout:changed', { layout: '3-pane' });
    } catch (e) {
      log.warn('Failed to save 3-pane layout sizes:', e);
    }
  }

  // Load function
  function loadSizes() {
    if (!persist) return;

    try {
      const savedSizes = localStorage.getItem(storageKey);
      if (savedSizes) {
        const sizes = JSON.parse(savedSizes);
        if (sizes.leftArea !== undefined) {
          leftAreaWidth = sizes.leftArea;
          leftContentArea.style.width = `${leftAreaWidth}%`;
        }
        if (sizes.editor !== undefined) {
          editorHeight = sizes.editor;
          editorPane.style.height = `${editorHeight}%`;
        }
      }
    } catch (e) {
      log.warn('Failed to load 3-pane layout sizes:', e);
    }
  }

  // Reset function
  function reset() {
    leftAreaWidth = 75;
    editorHeight = 70;
    leftContentArea.style.width = `${leftAreaWidth}%`;
    editorPane.style.height = `${editorHeight}%`;
    if (persist) {
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        log.warn('Failed to remove 3-pane layout sizes:', e);
      }
    }
    eventBus.emit('layout:changed', { layout: '3-pane-reset' });
  }

  return {
    container: mainContainer,
    getEditorPane: () => editorPane,
    getOutputPane: () => outputPane,
    getRightPane: () => rightPane,
    reset,
    dispose: () => {
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mousemove', handleHorizontalMouseMove);
      document.removeEventListener('mouseup', handleVerticalMouseUp);
      document.removeEventListener('mouseup', handleHorizontalMouseUp);
      container.removeChild(mainContainer);
    },
    saveSizes,
    loadSizes,
  };
}
