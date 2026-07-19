import { noteToMidi } from '@beatbax/engine';
import { MIDI_TO_ARKOS_OFFSET } from './arkos-types.js';

/** Convert a BeatBax note token (e.g. "C4", "A#3") to an Arkos note index. */
export function noteToArkos(token: string): number | null {
  // Strip duration suffix: C4:8 → C4
  const bare = token.replace(/:(\d+)$/, '');
  const midi = noteToMidi(bare);
  if (midi === null) return null;
  const arkos = midi - MIDI_TO_ARKOS_OFFSET;
  if (arkos < 0 || arkos > 127) return null;
  return arkos;
}

/** Tick length of a raw pattern token array from `song.pats`. */
export function patternTickLength(tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const durMatch = token.match(/:(\d+)$/);
    total += durMatch ? parseInt(durMatch[1], 10) : 1;
  }
  return total;
}
