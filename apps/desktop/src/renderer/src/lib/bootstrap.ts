/**
 * Desktop renderer bootstrap — initial editor content from storage or starter song.
 */

import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';

/** Default BPM used in the starter song when no setting is available. */
const DEFAULT_STARTER_BPM = 128;

/** Build the starter song template with the given BPM. */
export function getStarterSong(bpm: number = DEFAULT_STARTER_BPM): string {
  return `# Use File → Open or drag-and-drop a .bax file to load an existing song.
# See Help for BeatBax syntax and examples.
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

/** Prefer saved editor content; fall back to the starter song. */
export function getInitialContent(defaultBpm: number = DEFAULT_STARTER_BPM): string {
  try {
    const saved = storage.get(StorageKey.EDITOR_CONTENT);
    if (saved) return saved;
    const legacy = localStorage.getItem('beatbax-editor-content');
    if (legacy) return legacy;
  } catch {
    /* ignore storage errors */
  }
  return getStarterSong(defaultBpm);
}
