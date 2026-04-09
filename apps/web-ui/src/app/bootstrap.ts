/**
 * App bootstrap helpers.
 * Returns the editor's initial content from localStorage or the built-in starter
 * song.  Kept separate from main.ts so it can be unit-tested without a DOM.
 */

/** Default BPM used in the starter song when no setting is available. */
const DEFAULT_STARTER_BPM = 128;

/**
 * Build the starter song template with the given BPM.
 * Used both for the initial bootstrap and when the user creates a new song.
 */
export function getStarterSong(bpm: number = DEFAULT_STARTER_BPM): string {
  return `# Use the menu bar or toolbar to load an existing .bax file, or drag-and-drop a .bax file here to load it.
# See Help->Help Panel (Shift-F1) for language syntax and examples.
# Below is a simple 1-channel song with a single lead instrument and a repeating 4-note melody.

chip gameboy
bpm ${bpm}

inst lead type=pulse1 duty=50

pat melody = C5 E5 G5 C6

seq main  = melody melody:oct(-1) melody melody:oct(-2)

channel 1 => inst lead seq main

play
`;
}

/**
 * Returns the editor's initial content, preferring the most recent auto-save
 * in localStorage and falling back to the built-in starter song.
 * Pass the current default BPM setting so the starter song reflects it.
 */
export function getInitialContent(defaultBpm: number = DEFAULT_STARTER_BPM): string {
  try {
    const saved = localStorage.getItem('beatbax:editor.content');
    if (saved) return saved;
    // Fall back to legacy storage key
    const legacy = localStorage.getItem('beatbax-editor-content');
    if (legacy) return legacy;
  } catch (_e) { /* ignore */ }
  return getStarterSong(defaultBpm);
}
