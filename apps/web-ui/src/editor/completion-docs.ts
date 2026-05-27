/**
 * Completion documentation derived from chip hover docs and built-in summaries.
 */

import { chipRegistry } from '@beatbax/engine/chips';

/** Built-in docs for labels not always present on every chip plugin. */
const BUILTIN_COMPLETION_DOCS: Record<string, string> = {
  chip: 'Sets the target audio chip for this song.',
  inst: 'Declares a named instrument: inst <name> type=<channel> [props…]',
  pat: 'Pattern definition: pat <name> = <notes…>',
  seq: 'Sequence of pattern references with optional :transforms.',
  effect: 'Named effect preset reused as <name> or :name in sequences.',
  channel: 'Maps channel => inst <name> seq <sequence>.',
  play: 'Starts playback.',
  export: 'Exports the song: export <format> "file.ext"',
  import: 'Imports instruments: import "local:lib/file.ins" or import "github:user/repo/path.ins"',
  vib: 'Vibrato: vib:depth,rate[,waveform][,duration][,delayRows]',
  port: 'Portamento slide: port:speed',
  arp: 'Arpeggio: inline C4<arp:4,7> or seq transform arp(4,7) on every note.',
  volSlide: 'Volume slide: volSlide:delta[,steps]',
  trem: 'Tremolo: trem:depth,rate',
  pan: 'Pan: inline C4<pan:L> or seq transform pan(R) for a whole pattern slot.',
  echo: 'Echo: echo:delay,feedback,mix',
  retrig: 'Retrigger: retrig:interval[,volumeDelta]',
  cut: 'Note cut: cut:ticks',
  bend: 'Pitch bend: bend:semitones[,curve][,delay][,time]',
  pitch_env: 'Pitch macro: pitch_env:[values|loop]',
  sweep: 'Frequency sweep: sweep:amount',
  oct: 'Octave shift by N whole octaves: oct(+N) or oct(-N). Each step is 12 semitones.',
  rot: 'Cyclic left-rotate tokens by N: rot(N). [C4 D4 E4 G4]:rot(1) → D4 E4 G4 C4.',
  rotate: 'Rotate alias: rotate(N) — same as rot(N).',
  rev: 'Reverse token order: rev. [C4 D4 E4 G4] → G4 E4 D4 C4.',
  pal: 'Palindrome: forward then backward without duplicating pivot. Doubles phrase length.',
  palindrome: 'Palindrome alias: palindrome — same as pal.',
  slow: 'Stretch pattern: repeat each token (default ×2). slow(N) repeats N times.',
  fast: 'Compress pattern: keep every Nth token (default every 2nd). Opposite of slow.',
  transpose: 'Shift all notes by semitones: transpose(+N), st(N), trans(N), or bare +N/-N.',
  semitone: 'Transpose alias: semitone(+N).',
  st: 'Transpose short alias: st(+N).',
  trans: 'Transpose alias: trans(+N).',
  clamp: 'Hard-limit pitches to range: clamp(C3,C6). Out-of-range notes are cut.',
  fold: 'Octave-wrap pitches into range: fold(C3,C6). Wraps instead of clipping.',
  mute: 'Replace notes with rests; rhythm unchanged. Same as rest.',
  rest: 'Mute alias: rest — silence all notes in the slot.',
  invert: 'Mirror pitch contour around first note: invert or inv',
  inv: 'Invert alias: inv',
  every: 'Apply MOD every Nth token: every(N,MOD)',
  off: 'Prepend N rests: off(N)',
  lag: 'Pickup delay alias for off: lag(N)',
  pick: 'Keep 1-based positions: pick(1,3,…)',
  chunk: 'Reverse each chunk of N: chunk(N)',
  shuffle: 'Deterministic reorder: shuffle(seed)',
};

function markdownToCompletionDoc(md: string, maxLen = 280): string {
  const plain = md
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return plain.length <= maxLen ? plain : `${plain.slice(0, maxLen - 1)}…`;
}

/** Markdown documentation for a completion label on the active chip. */
export function documentationForCompletion(label: string, chip: string): string | undefined {
  const key = label.replace(/^:/, '').split('(')[0].trim();
  const plugin = chipRegistry.get(chip);
  const chipDoc = plugin?.uiContributions?.hoverDocs?.[key];
  if (chipDoc) return markdownToCompletionDoc(chipDoc);
  const builtIn = BUILTIN_COMPLETION_DOCS[key];
  if (builtIn) return builtIn;
  return undefined;
}

/** Attach documentation to completion items when available. */
export function withDocumentation<T extends { label: string | { label: string } }>(
  items: T[],
  chip: string,
): T[] {
  return items.map((item) => {
    const labelKey = typeof item.label === 'string' ? item.label : item.label.label;
    const doc = documentationForCompletion(labelKey, chip);
    if (!doc) return item;
    return { ...item, documentation: { value: doc } } as T;
  });
}
