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
  arp: 'Arpeggio offsets: arp:semis…',
  volSlide: 'Volume slide: volSlide:delta[,steps]',
  trem: 'Tremolo: trem:depth,rate',
  pan: 'Pan: pan:L|C|R or pan:-1..1',
  echo: 'Echo: echo:delay,feedback,mix',
  retrig: 'Retrigger: retrig:interval[,volumeDelta]',
  cut: 'Note cut: cut:ticks',
  bend: 'Pitch bend: bend:semitones[,curve][,delay][,time]',
  pitch_env: 'Pitch macro: pitch_env:[values|loop]',
  sweep: 'Frequency sweep: sweep:amount',
  oct: 'Octave shift: oct(+N) or oct(-N)',
  rev: 'Reverse pattern tokens.',
  slow: 'Double note durations.',
  fast: 'Halve note durations.',
  transpose: 'Transpose by semitones: transpose(+N)',
  clamp: 'Clamp pitches: clamp(C3,C6)',
  fold: 'Fold pitches into range: fold(C3,C6)',
  mute: 'Replace notes with rests.',
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
