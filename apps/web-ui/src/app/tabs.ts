/**
 * Tab system controllers for the bottom pane (Problems | Output) and the
 * right pane (Mixer | Help | Copilot).
 *
 * CSS for these elements lives in src/styles.css (moved from the original
 * document.createElement('style') injections that were in main.ts).
 */

import type { ThreePaneLayoutManager } from '../ui/layout';

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
  /** Update the Problems tab badge with current error/warning counts. */
  updateBadge(errors: number, warnings: number): void;
}

export function buildBottomTabs(
  outputPane: HTMLElement,
  layout: ThreePaneLayoutManager,
): BottomTabsController {
  let activeTab: BottomTabId | null = 'problems';
  const tabOpen:     Record<BottomTabId, boolean>                          = { problems: true, output: true };
  const tabButtons:  Partial<Record<BottomTabId, HTMLButtonElement>>       = {};
  const tabContents: Partial<Record<BottomTabId, HTMLElement>>             = {};

  const switchTab = (tab: BottomTabId): void => {
    activeTab = tab;
    for (const t of BOTTOM_TAB_ORDER) {
      tabButtons[t]?.classList.toggle('bb-bottom-tab--active',         t === tab);
      tabContents[t]?.classList.toggle('bb-bottom-tab-content--active', t === tab);
    }
  };

  const show = (tab: BottomTabId): void => {
    tabOpen[tab] = true;
    tabButtons[tab]?.classList.remove('bb-bottom-tab--hidden');
    layout.setOutputPaneVisible(true);
    switchTab(tab);
  };

  const close = (tab: BottomTabId): void => {
    tabOpen[tab] = false;
    tabButtons[tab]?.classList.remove('bb-bottom-tab--active');
    tabButtons[tab]?.classList.add('bb-bottom-tab--hidden');
    tabContents[tab]?.classList.remove('bb-bottom-tab-content--active');
    if (activeTab === tab) {
      const next = BOTTOM_TAB_ORDER.find(t => t !== tab && tabOpen[t]);
      if (next) {
        switchTab(next);
      } else {
        activeTab = null;
        layout.setOutputPaneVisible(false);
      }
    }
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

  for (const t of BOTTOM_TAB_ORDER) {
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

  switchTab('problems');

  return {
    tabContents: tabContents as Record<BottomTabId, HTMLElement>,
    tabButtons,
    tabOpen,
    show,
    close,
    switch: switchTab,
    updateBadge,
  };
}

// ─── Right Tabs (Mixer | Help | Copilot) ─────────────────────────────────────

export type RightTabId = 'channels' | 'help' | 'ai';

const RIGHT_TAB_LABELS: Record<RightTabId, string> = {
  channels: 'Mixer',
  help:     'Help',
  ai:       'Copilot',
};
const RIGHT_TAB_ORDER: RightTabId[]  = ['channels', 'help', 'ai'];
const RIGHT_TAB_STORAGE_KEY = 'bb-active-right-tab';

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
   * was created, or fall back to 'channels'.  Call this after all tab content
   * (including the AI panel) has been fully initialised.
   */
  restorePersistedTab(): void;
}

export function buildRightTabs(
  rightPane: HTMLElement,
  layout: ThreePaneLayoutManager,
): RightTabsController {
  // Capture the saved tab BEFORE switchTab('channels') overwrites it.
  let savedInitialTab: RightTabId | null = null;
  try {
    const raw = localStorage.getItem(RIGHT_TAB_STORAGE_KEY);
    if (raw && (RIGHT_TAB_ORDER as string[]).includes(raw)) {
      savedInitialTab = raw as RightTabId;
    }
  } catch { /* ignore */ }

  let activeTab: RightTabId | null = 'channels';
  const tabOpen:     Record<RightTabId, boolean>                    = { channels: true, help: true, ai: false };
  const tabButtons:  Partial<Record<RightTabId, HTMLButtonElement>> = {};
  const tabContents: Partial<Record<RightTabId, HTMLElement>>       = {};

  const rightTabs = document.createElement('div');
  rightTabs.className = 'bb-right-tabs';
  rightPane.appendChild(rightTabs);

  const switchTab = (tab: RightTabId): void => {
    activeTab = tab;
    try { localStorage.setItem(RIGHT_TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
    rightTabs.classList.remove('bb-right-tabs--empty');
    for (const t of RIGHT_TAB_ORDER) {
      tabButtons[t]?.classList.toggle('bb-right-tab--active',         t === tab);
      tabContents[t]?.classList.toggle('bb-right-tab-content--active', t === tab);
    }
  };

  const show = (tab: RightTabId): void => {
    tabOpen[tab] = true;
    tabButtons[tab]?.classList.remove('bb-right-tab--hidden');
    layout.setRightPaneVisible(true);
    switchTab(tab);
  };

  const close = (tab: RightTabId): void => {
    tabOpen[tab] = false;
    tabButtons[tab]?.classList.remove('bb-right-tab--active');
    tabButtons[tab]?.classList.add('bb-right-tab--hidden');
    tabContents[tab]?.classList.remove('bb-right-tab-content--active');
    if (activeTab === tab) {
      const next = RIGHT_TAB_ORDER.find(t => t !== tab && tabOpen[t]);
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
    switchTab('channels');
  };

  // ─── DOM construction ──────────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'bb-right-tab-bar';
  rightTabs.appendChild(tabBar);

  for (const t of RIGHT_TAB_ORDER) {
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

  // Initial switch (writes 'channels' to localStorage — saved tab was already captured above).
  switchTab('channels');

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
