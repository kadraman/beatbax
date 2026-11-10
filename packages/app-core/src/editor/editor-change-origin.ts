/**
 * Transport Live (hot-reload play) and Instrument Editor writeback share
 * `editor:changed`. Writes from the Instrument Editor must still parse, and
 * must not arm playback. A later Monaco edit clears that mark.
 */

/** `executeEdits` source used by Instrument Editor buffer writes. */
export const INSTRUMENT_EDITOR_EDIT_SOURCE = 'instrument-editor';

export type EditorChangeOrigin = typeof INSTRUMENT_EDITOR_EDIT_SOURCE | 'user';

let instrumentEditorEditDepth = 0;
let pendingOrigin: EditorChangeOrigin = 'user';

/** Wrap `executeEdits` for an Instrument Editor write. Content listeners see the depth. */
export function beginInstrumentEditorEdit(): void {
  instrumentEditorEditDepth++;
}

export function endInstrumentEditorEdit(): void {
  instrumentEditorEditDepth = Math.max(0, instrumentEditorEditDepth - 1);
}

/** Call from the Monaco model-content listener, before `editor:changed` is scheduled. */
export function noteEditorModelChange(): void {
  pendingOrigin = instrumentEditorEditDepth > 0 ? INSTRUMENT_EDITOR_EDIT_SOURCE : 'user';
}

/** Origin for the `editor:changed` about to be emitted. Resets to a user edit. */
export function consumeEditorChangeOrigin(): EditorChangeOrigin {
  const origin = pendingOrigin;
  pendingOrigin = 'user';
  return origin;
}

export function shouldArmTransportLive(input: {
  liveMode: boolean;
  hasParseErrors: boolean;
  origin?: EditorChangeOrigin | string;
}): boolean {
  if (!input.liveMode || input.hasParseErrors) return false;
  return input.origin !== INSTRUMENT_EDITOR_EDIT_SOURCE;
}

/** Test-only. Production call sites keep depth and origin through the edit. */
export function resetEditorChangeOriginForTests(): void {
  instrumentEditorEditDepth = 0;
  pendingOrigin = 'user';
}
