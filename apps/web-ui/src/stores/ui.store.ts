/**
 * ui.store — miscellaneous UI state (nanostores).
 *
 * Covers panel visibility, loading spinner ref-count, and active tab state.
 */

import { atom, map } from 'nanostores';

/** Number of pending async operations; spinner shows when > 0. */
export const spinnerCount = atom<number>(0);

/** Which tab is active in the output pane ('output' | 'problems'). */
export const activeOutputTab = atom<'output' | 'problems'>('output');

/** Which tab is active in the right pane ('mixer' | 'chat' | 'help'). */
export const activeRightTab = atom<'mixer' | 'chat' | 'help'>('mixer');

/** Per-panel visibility flags.  Key = panel id string. */
export const panelVisibility = map<Record<string, boolean>>({
  output: true,
  problems: true,
  help: true,
  'channel-mixer': true,
  toolbar: true,
  'transport-bar': true,
  'ai-assistant': false,
});

// ── Export status ─────────────────────────────────────────────────────────────

export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';

/** Current export pipeline status. */
export const exportStatus = atom<ExportStatus>('idle');

/** Format being exported (e.g. 'json', 'midi', 'uge'). Relevant when exportStatus !== 'idle'. */
export const exportFormat = atom<string>('');

// ── Helpers ───────────────────────────────────────────────────────────────────

export function showSpinner(): void {
  spinnerCount.set(spinnerCount.get() + 1);
}

export function hideSpinner(): void {
  spinnerCount.set(Math.max(0, spinnerCount.get() - 1));
}

export function togglePanel(id: string): void {
  const current = panelVisibility.get();
  panelVisibility.setKey(id, !(current[id] ?? true));
}
