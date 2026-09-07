/**
 * Computer-key gating for Instrument Editor note preview (A–J, Z/X).
 *
 * Preview keys must not type into the source editor. Selecting an instrument
 * therefore reveals/highlights the `inst` line without focusing Monaco, then
 * restores focus to the panel.
 */

export function isInstrumentEditorTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  return target.isContentEditable === true;
}

/**
 * Whether A–J / Z/X should preview while the Instruments tab is showing.
 * Skips modifier chords and typing surfaces (panel fields and Monaco).
 */
export function shouldHandleInstrumentPreviewKey(
  e: KeyboardEvent,
  panel: HTMLElement | null,
): boolean {
  if (!panel?.closest('.bb-right-tab-content--active')) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (isInstrumentEditorTypingTarget(e.target)) return false;
  return true;
}

/** Return keyboard focus to the panel so A–J preview instead of typing. */
export function focusInstrumentEditorPanel(panel: HTMLElement | null): void {
  if (!panel) return;
  panel.focus({ preventScroll: true });
}
