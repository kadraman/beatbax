/**
 * App-level layout construction.
 *
 * Creates the menu bar host, toolbar host, and the 3-pane resizable shell,
 * then appends everything to the given `appContainer`.  Returns element
 * references so the caller can mount components into each pane.
 *
 * The `outputPane` is pre-configured as a flex column (padding cleared,
 * overflow hidden) so the tab system can mount directly inside it.
 */

import { createThreePaneLayout, type ThreePaneLayoutManager } from '../ui/layout';

export interface AppLayout {
  menuBarContainer: HTMLElement;
  toolbarContainer: HTMLElement;
  /** Host for the TransportBar (immediately below the toolbar). */
  layoutHost: HTMLElement;
  /** Host for the PatternGrid (below TransportBar, above three-pane layout). */
  patternGridContainer: HTMLElement;
  /** Host for the Channel Mixer in full-width docked mode (below all three panes). */
  mixerHostContainer: HTMLElement;
  /** Host for the Channel Mixer in inline mode (bottom of the left content column, below the output pane). */
  inlineMixerContainer: HTMLElement;
  editorPane: HTMLElement;
  outputPane: HTMLElement;
  rightPane: HTMLElement;
  layout: ThreePaneLayoutManager;
}

/**
 * Build the top-level app shell and append it to `appContainer`.
 * Call this once, early in bootstrap, before mounting any component.
 */
export function buildAppLayout(appContainer: HTMLElement): AppLayout {
  // ─── Menu bar host (topmost) ──────────────────────────────────────────────
  const menuBarContainer = document.createElement('div');
  menuBarContainer.id = 'bb-menu-bar-host';
  appContainer.appendChild(menuBarContainer);

  // ─── Toolbar host (below menu bar) ────────────────────────────────────────
  const toolbarContainer = document.createElement('div');
  toolbarContainer.id = 'bb-toolbar-host';
  appContainer.appendChild(toolbarContainer);

  // ─── Layout host (fills remaining height) ─────────────────────────────────
  const layoutHost = document.createElement('div');
  layoutHost.style.cssText =
    'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column; padding-bottom: 24px;';
  appContainer.appendChild(layoutHost);

  // ─── Pattern grid host (between TransportBar and three-pane layout) ──────────────
  // TransportBar.constructor does insertBefore(firstChild) on layoutHost, so
  // it will push in above this element automatically.
  const patternGridContainer = document.createElement('div');
  patternGridContainer.id = 'bb-pattern-grid-host';
  layoutHost.appendChild(patternGridContainer);

  const layout = createThreePaneLayout({ container: layoutHost, persist: true });
  const editorPane = layout.getEditorPane();
  const rightPane  = layout.getRightPane();

  // Prepare the output pane for use as a flex tab container.
  const outputPane = layout.getOutputPane();
  outputPane.style.padding       = '0';
  outputPane.style.overflow      = 'hidden';
  outputPane.style.display       = 'flex';
  outputPane.style.flexDirection = 'column';
  outputPane.style.fontFamily    = '';
  outputPane.style.fontSize      = '';

  // ─── Inline mixer host (bottom of the left content column, below the output pane).
  // Placing it here (in leftContentArea, not inside outputPane) means its full height
  // is always visible regardless of how small the output pane is dragged — the output
  // pane (flex: 1) absorbs the remaining space above it.
  // flex-shrink: 0 ensures the mixer is never compressed by the flex algorithm.
  const inlineMixerContainer = document.createElement('div');
  inlineMixerContainer.id = 'bb-inline-mixer-host';
  inlineMixerContainer.style.flexShrink = '0';
  layout.getLeftContentArea().appendChild(inlineMixerContainer);

  // ─── Docked mixer host (full-width, below all three panes) ───────────────
  const mixerHostContainer = document.createElement('div');
  mixerHostContainer.id = 'bb-mixer-host';
  layoutHost.appendChild(mixerHostContainer);

  return { menuBarContainer, toolbarContainer, layoutHost, patternGridContainer, mixerHostContainer, inlineMixerContainer, editorPane, outputPane, rightPane, layout };
}
