/**
 * App bootstrap helpers.
 * Returns the editor's initial content from localStorage or the built-in starter
 * song.  Kept separate from main.ts so it can be unit-tested without a DOM.
 */

const STARTER_SONG = `# BeatBax Web IDE
# Use the menu bar (File / Edit / View / Help) for all operations.
# Drag-and-drop a .bax file to load it, or use File → Open.

chip gameboy
bpm 140
time 4

inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst kick  type=noise  env=12,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]

pat melody  = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat beat    = C6 . . C6 . C6 C6 .

seq main  = melody melody melody melody
seq groove = bassline bassline
seq perc  = beat beat beat beat

channel 1 => inst lead  seq main
channel 2 => inst bass  seq groove:oct(-1)
channel 3 => inst wave1 seq main:oct(-1)
channel 4 => inst kick  seq perc

play
`;

/**
 * Returns the editor's initial content, preferring the most recent auto-save
 * in localStorage and falling back to the built-in starter song.
 */
export function getInitialContent(): string {
  try {
    const saved = localStorage.getItem('beatbax:editor.content');
    if (saved) return saved;
    // Fall back to legacy storage key
    const legacy = localStorage.getItem('beatbax-editor-content');
    if (legacy) return legacy;
  } catch (_e) { /* ignore */ }
  return STARTER_SONG;
}
