/**
 * Tab system controllers for the bottom pane (Problems | Output) and the
 * right pane (Visualizer | Help | Copilot).
 *
 * CSS for these elements lives in src/styles.css (moved from the original
 * document.createElement('style') injections that were in main.ts).
 */

import type { ThreePaneLayoutManager } from './layout';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { getCurrentCapabilities } from '@beatbax/app-core/client-profile';
import { filledIcon } from '../../utils/icons';

// ─── Bottom Tabs (Problems | Output) ─────────────────────────────────────────

export type BottomTabId = 'problems' | 'output';

const BOTTOM_TAB_LABELS: Record<BottomTabId, string> = {
  problems: 'Problems',
  output:   'Output',
};
const BOTTOM_TAB_ORDER: BottomTabId[] = ['problems', 'output'];

export interface BottomTabsController {
  readonly tabContents: Record<BottomTabId, HTMLElement>;
  readonly tabButtons:  Partial<Record<BottomTabId, HTMLButtonElement>>;
  readonly tabOpen:     Record<BottomTabId, boolean>;
  /** Open and activate a tab; shows the output pane if collapsed. */
  show(tab: BottomTabId): void;
  /** Close a tab; switches to neighbour or collapses the pane. */
  close(tab: BottomTabId): void;
  /** Activate an already-open tab without toggling pane visibility. */
  switch(tab: BottomTabId): void;
  /** Expand the bottom pane and restore the last active tab (or Problems). */
  expandPane(): void;
  /** Collapse the bottom pane without closing tabs (mirrors right-pane collapse). */
  collapsePane(): void;
  /** Whether the bottom pane is currently visible. */
  isPaneVisible(): boolean;
  /** Update the Problems tab badge with current error/warning counts. */
  updateBadge(errors: number, warnings: number): void;
}

export interface BuildBottomTabsOptions {
  /** Fired when the active bottom tab changes (null when the pane is collapsed). */
  onActiveTabChange?: (tab: BottomTabId | null) => void;
}

export function buildBottomTabs(
  outputPane: HTMLElement,
  layout: ThreePaneLayoutManager,
  options: BuildBottomTabsOptions = {},
): BottomTabsController {
  const caps = getCurrentCapabilities();
  const bottomTabOrder: BottomTabId[] = caps.outputPanel
    ? BOTTOM_TAB_ORDER
    : ['problems'];

  let activeTab: BottomTabId | null = 'problems';
  let lastActiveTab: BottomTabId = 'problems';
  const tabOpen: Record<BottomTabId, boolean> = {
    problems: true,
    output: caps.outputPanel,
  };
  const tabButtons:  Partial<Record<BottomTabId, HTMLButtonElement>>       = {};
  const tabContents: Partial<Record<BottomTabId, HTMLElement>>             = {};
  let collapseBtn: HTMLButtonElement | null = null;

  const syncCollapseBtn = (expanded: boolean): void => {
    if (!collapseBtn) return;
    if (expanded) {
      collapseBtn.title = 'Collapse panel';
      collapseBtn.setAttribute('aria-label', 'Collapse bottom panel');
      collapseBtn.innerHTML = filledIcon('triangle-down');
      collapseBtn.classList.remove('bb-bottom-tab-collapse-btn--collapsed');
    } else {
      collapseBtn.title = 'Expand panel';
      collapseBtn.setAttribute('aria-label', 'Expand bottom panel');
      collapseBtn.innerHTML = filledIcon('triangle-up');
      collapseBtn.classList.add('bb-bottom-tab-collapse-btn--collapsed');
    }
  };

  const notifyActiveTab = (): void => {
    options.onActiveTabChange?.(activeTab);
  };

  const switchTab = (tab: BottomTabId): void => {
    activeTab = tab;
    lastActiveTab = tab;
    for (const t of bottomTabOrder) {
      tabButtons[t]?.classList.toggle('bb-bottom-tab--active',         t === tab);
      tabContents[t]?.classList.toggle('bb-bottom-tab-content--active', t === tab);
    }
    notifyActiveTab();
  };

  const show = (tab: BottomTabId): void => {
    tabOpen[tab] = true;
    tabButtons[tab]?.classList.remove('bb-bottom-tab--hidden');
    layout.setOutputPaneVisible(true);
    syncCollapseBtn(true);
    switchTab(tab);
  };

  const close = (tab: BottomTabId): void => {
    tabOpen[tab] = false;
    tabButtons[tab]?.classList.remove('bb-bottom-tab--active');
    tabButtons[tab]?.classList.add('bb-bottom-tab--hidden');
    tabContents[tab]?.classList.remove('bb-bottom-tab-content--active');
    if (activeTab === tab) {
      const next = bottomTabOrder.find(t => t !== tab && tabOpen[t]);
      if (next) {
        switchTab(next);
      } else {
        activeTab = null;
        layout.setOutputPaneVisible(false);
        syncCollapseBtn(false);
        notifyActiveTab();
      }
    }
  };

  const collapsePane = (): void => {
    if (!layout.isOutputPaneVisible()) return;
    layout.setOutputPaneVisible(false);
    syncCollapseBtn(false);
  };

  const expandPane = (): void => {
    const preferred = activeTab && tabOpen[activeTab]
      ? activeTab
      : tabOpen[lastActiveTab]
        ? lastActiveTab
        : null;
    const fallback = bottomTabOrder.find(t => tabOpen[t]) ?? 'problems';
    show(preferred ?? fallback);
  };

  let badgeErrors   = 0;
  let badgeWarnings = 0;
  const updateBadge = (errors: number, warnings: number): void => {
    badgeErrors   = errors;
    badgeWarnings = warnings;
    const labelSpan = tabButtons['problems']?.querySelector<HTMLElement>('.bb-bottom-tab__label');
    if (!labelSpan) return;
    const total = badgeErrors + badgeWarnings;
    if (total > 0) {
      labelSpan.innerHTML = `Problems <span class="bb-tab-badge">${total}</span>`;
    } else {
      labelSpan.textContent = 'Problems';
    }
  };

  // ─── DOM construction ──────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'bb-bottom-tab-bar';
  outputPane.appendChild(tabBar);

  for (const t of bottomTabOrder) {
    const btn = document.createElement('button');
    btn.className = 'bb-bottom-tab';
    btn.title = BOTTOM_TAB_LABELS[t];

    const labelSpan = document.createElement('span');
    labelSpan.className = 'bb-bottom-tab__label';
    labelSpan.textContent = BOTTOM_TAB_LABELS[t];

    const closeBtn = document.createElement('span');
    closeBtn.className = 'bb-bottom-tab__close';
    closeBtn.textContent = '✕';
    closeBtn.title = `Close ${BOTTOM_TAB_LABELS[t]}`;
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(t); });

    btn.append(labelSpan, closeBtn);
    btn.addEventListener('click', () => show(t));
    tabButtons[t] = btn;
    tabBar.appendChild(btn);

    const content = document.createElement('div');
    content.className = 'bb-bottom-tab-content';
    tabContents[t] = content;
    outputPane.appendChild(content);
  }

  // ── Collapse / expand button at the far right of the tab bar ─────────────
  // Mirrors the right-pane collapse control so users can hide the bottom pane
  // without closing individual tabs.
  let bottomPaneCollapsed = false;
  collapseBtn = document.createElement('button');
  collapseBtn.className = 'bb-bottom-tab-collapse-btn';
  collapseBtn.title = 'Collapse panel';
  collapseBtn.setAttribute('aria-label', 'Collapse bottom panel');
  collapseBtn.innerHTML = filledIcon('triangle-down');
  tabBar.appendChild(collapseBtn);

  // ── Expand strip (thin bar visible when pane is collapsed) ────────────────
  const expandStrip = layout.getOutputPaneExpandStrip();
  expandStrip.title = 'Expand panel';
  expandStrip.setAttribute('aria-label', 'Expand bottom panel');
  const expandStripBtn = expandStrip.querySelector('button');
  if (expandStripBtn) {
    expandStripBtn.title = 'Expand panel';
    expandStripBtn.setAttribute('aria-label', 'Expand bottom panel');
    expandStripBtn.innerHTML = filledIcon('triangle-up');
  }

  const doExpand = (): void => {
    bottomPaneCollapsed = false;
    expandPane();
  };

  const doCollapse = (): void => {
    bottomPaneCollapsed = true;
    collapsePane();
  };

  collapseBtn.addEventListener('click', () => {
    bottomPaneCollapsed ? doExpand() : doCollapse();
  });
  expandStrip.addEventListener('click', doExpand);

  switchTab('problems');
  layout.setOutputPaneVisible(true);
  syncCollapseBtn(true);

  return {
    tabContents: tabContents as Record<BottomTabId, HTMLElement>,
    tabButtons,
    tabOpen,
    show,
    close,
    switch: switchTab,
    expandPane: doExpand,
    collapsePane: doCollapse,
    isPaneVisible: () => layout.isOutputPaneVisible(),
    updateBadge,
  };
}

// ─── Right Tabs (Visualizer | Help | Copilot) ────────────────────────────────

export type RightTabId = 'channels' | 'help' | 'ai';

const RIGHT_TAB_LABELS: Record<RightTabId, string> = {
  channels: 'Visualizer',
  help:     'Help',
  ai:       'Copilot',
};
const RIGHT_TAB_ORDER: RightTabId[]  = ['channels', 'help', 'ai'];

export interface RightTabsController {
  readonly tabContents:     Record<RightTabId, HTMLElement>;
  readonly tabButtons:      Partial<Record<RightTabId, HTMLButtonElement>>;
  readonly tabOpen:         Record<RightTabId, boolean>;
  /** Currently-active tab (null when the pane is collapsed/empty). */
  readonly activeTab:       RightTabId | null;
  /** Tab that was persisted in localStorage before this controller was built. */
  readonly savedInitialTab: RightTabId | null;
  /** Open and activate a tab; shows the right pane if collapsed. */
  show(tab: RightTabId): void;
  /** Close a tab; switches to neighbour or collapses the pane. */
  close(tab: RightTabId): void;
  /** Activate an already-open tab without toggling pane visibility. */
  switch(tab: RightTabId): void;
  /**
   * Switch to the tab that was persisted in localStorage when this controller
   * was created, or fall back to the first available tab.  Call this after all tab content
   * (including the AI panel) has been fully initialised.
   */
  restorePersistedTab(): void;
}

export function buildRightTabs(
  rightPane: HTMLElement,
  layout: ThreePaneLayoutManager,
): RightTabsController {
  const caps = getCurrentCapabilities();
  const rightTabOrder: RightTabId[] = RIGHT_TAB_ORDER.filter(t => {
        if (t === 'channels') return caps.songVisualizer;
        if (t === 'ai') return caps.copilot;
        if (t === 'help') return caps.helpPanel;
        return true;
      });
  // Capture the saved tab BEFORE the initial switch overwrites it.
  let savedInitialTab: RightTabId | null = null;
  try {
    const raw = storage.get(StorageKey.ACTIVE_RIGHT_TAB);
    if (raw && (rightTabOrder as string[]).includes(raw)) {
      savedInitialTab = raw as RightTabId;
    }
  } catch { /* ignore */ }

  const defaultTab = rightTabOrder[0] ?? null;
  let activeTab: RightTabId | null = defaultTab;
  const tabOpen: Record<RightTabId, boolean> = {
    channels: caps.songVisualizer,
    help: caps.helpPanel,
    ai: caps.copilot,
  };
  const tabButtons:  Partial<Record<RightTabId, HTMLButtonElement>> = {};
  const tabContents: Partial<Record<RightTabId, HTMLElement>>       = {};

  const rightTabs = document.createElement('div');
  rightTabs.className = 'bb-right-tabs';
  rightPane.appendChild(rightTabs);

  const switchTab = (tab: RightTabId): void => {
    if (!rightTabOrder.includes(tab)) return;
    activeTab = tab;
    try { storage.set(StorageKey.ACTIVE_RIGHT_TAB, tab); } catch { /* ignore */ }
    rightTabs.classList.remove('bb-right-tabs--empty');
    for (const t of rightTabOrder) {
      tabButtons[t]?.classList.toggle('bb-right-tab--active',         t === tab);
      tabContents[t]?.classList.toggle('bb-right-tab-content--active', t === tab);
    }
  };

  const show = (tab: RightTabId): void => {
    if (!rightTabOrder.includes(tab)) return;
    tabOpen[tab] = true;
    tabButtons[tab]?.classList.remove('bb-right-tab--hidden');
    layout.setRightPaneVisible(true);
    switchTab(tab);
  };

  const close = (tab: RightTabId): void => {
    if (!rightTabOrder.includes(tab)) return;
    tabOpen[tab] = false;
    tabButtons[tab]?.classList.remove('bb-right-tab--active');
    tabButtons[tab]?.classList.add('bb-right-tab--hidden');
    tabContents[tab]?.classList.remove('bb-right-tab-content--active');
    if (activeTab === tab) {
      const next = rightTabOrder.find(t => t !== tab && tabOpen[t]);
      if (next) {
        switchTab(next);
      } else {
        activeTab = null;
        rightTabs.classList.add('bb-right-tabs--empty');
        layout.setRightPaneVisible(false);
      }
    }
  };

  const restorePersistedTab = (): void => {
    try {
      if (savedInitialTab && tabOpen[savedInitialTab]) {
        switchTab(savedInitialTab);
        return;
      }
    } catch { /* ignore */ }
    if (defaultTab) switchTab(defaultTab);
  };

  // ─── DOM construction ──────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'bb-right-tab-bar';
  rightTabs.appendChild(tabBar);

  for (const t of rightTabOrder) {
    const btn = document.createElement('button');
    btn.className = 'bb-right-tab';
    btn.title = RIGHT_TAB_LABELS[t];

    const labelSpan = document.createElement('span');
    labelSpan.className = 'bb-right-tab__label';
    labelSpan.textContent = RIGHT_TAB_LABELS[t];

    const closeBtn = document.createElement('span');
    closeBtn.className = 'bb-right-tab__close';
    closeBtn.textContent = '✕';
    closeBtn.title = `Close ${RIGHT_TAB_LABELS[t]}`;
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(t); });

    btn.append(labelSpan, closeBtn);
    btn.addEventListener('click', () => show(t));
    tabButtons[t] = btn;
    tabBar.appendChild(btn);

    const content = document.createElement('div');
    content.className = 'bb-right-tab-content';
    tabContents[t] = content;
    rightTabs.appendChild(content);
  }

  // ── Collapse / expand button at the far right of the tab bar ─────────────
  // Mirrors the HorizontalMixer collapse button so users can hide the right
  // pane without closing individual tabs.
  let rightPaneCollapsed = false;
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'bb-right-tab-collapse-btn';
  collapseBtn.title = 'Collapse panel';
  collapseBtn.setAttribute('aria-label', 'Collapse right panel');
  collapseBtn.innerHTML = filledIcon('triangle-right');

  // ── Expand strip (thin sidebar visible when pane is collapsed) ────────────
  const expandStrip = layout.getRightPaneExpandStrip();
  expandStrip.title = 'Expand panel';
  expandStrip.setAttribute('aria-label', 'Expand right panel');
  const expandStripBtn = document.createElement('button');
  expandStripBtn.className = 'bb-right-expand-strip__btn';
  expandStripBtn.title = 'Expand panel';
  expandStripBtn.setAttribute('aria-label', 'Expand right panel');
  expandStripBtn.innerHTML = filledIcon('triangle-left');
  expandStrip.appendChild(expandStripBtn);

  const doCollapse = () => {
    rightPaneCollapsed = true;
    layout.setRightPaneVisible(false);
    collapseBtn.title = 'Expand panel';
    collapseBtn.setAttribute('aria-label', 'Expand right panel');
    collapseBtn.innerHTML = filledIcon('triangle-left');
    collapseBtn.classList.add('bb-right-tab-collapse-btn--collapsed');
  };

  const doExpand = () => {
    rightPaneCollapsed = false;
    layout.setRightPaneVisible(true);
    collapseBtn.title = 'Collapse panel';
    collapseBtn.setAttribute('aria-label', 'Collapse right panel');
    collapseBtn.innerHTML = filledIcon('triangle-right');
    collapseBtn.classList.remove('bb-right-tab-collapse-btn--collapsed');
  };

  collapseBtn.addEventListener('click', () => {
    rightPaneCollapsed ? doExpand() : doCollapse();
  });
  expandStripBtn.addEventListener('click', doExpand);
  expandStrip.addEventListener('click', doExpand);
  tabBar.appendChild(collapseBtn);

  // Initial switch writes the default tab to localStorage; saved tab was already captured above.
  if (defaultTab) switchTab(defaultTab);
  else {
    activeTab = null;
    rightTabs.classList.add('bb-right-tabs--empty');
    layout.setRightPaneVisible(false);
  }

  return {
    tabContents:     tabContents as Record<RightTabId, HTMLElement>,
    tabButtons,
    tabOpen,
    get activeTab()       { return activeTab; },
    savedInitialTab,
    show,
    close,
    switch:              switchTab,
    restorePersistedTab,
  };
}
