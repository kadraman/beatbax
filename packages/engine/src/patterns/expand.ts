/**
 * Pattern expansion utilities.
 *
 * Supported features:
 * - Notes like C3, G#4, Bb2
 * - Rests as `.`
 * - Element repeat: `C4*3` repeats C4 three times
 * - Group repeat: `(C4 E4 G4)*2` repeats the group twice
 * - Transpose by semitones or octaves via helper functions
 */

import { noteToMidi, midiToNote } from '../util/music.js';

export { noteToMidi, midiToNote };

/** Expand a pattern string into an array of tokens.
 * Grammar (informal):
 *  pattern := item (WS item)*
 *  item := group ('*' number)? | token ('*' number)?
 *  group := '(' pattern ')'
 *  token := NOTE | '.' | IDENT
 */
export function expandPattern(text: string): string[] {
  // Preprocess to normalize spaces around * operators
  text = text.replace(/\)\s*\*\s*(\d+)/g, ')*$1');
  text = text.replace(/([^\s\(\)])\s*\*\s*(\d+)/g, '$1*$2');

  // Tokenize by spaces but keep parentheses and *number attached
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++; continue;
    }
    if (ch === '(') {
      // find matching ')'
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')') depth--;
        j++;
      }
      const group = text.slice(i + 1, j - 1);
      // check for *N (skip whitespace first)
      let k = j;
      while (k < text.length && /\s/.test(text[k])) k++;
      let repeat = 1;
      if (k < text.length && text[k] === '*') {
        k++;
        const m = text.slice(k).match(/^\d+/);
        if (m) {
          repeat = parseInt(m[0], 10);
          k += m[0].length;
        }
      }
      // expand group recursively repeat times
      const expandedGroup = expandPattern(group);
      for (let r = 0; r < repeat; r++) tokens.push(...expandedGroup);
      i = k;
      continue;
    }

    // read until whitespace
    let j = i;
    while (j < text.length && !/\s/.test(text[j])) j++;
    let atom = text.slice(i, j);

    // check for :duration suffix (e.g. C5:4 -> C5 _ _ _)
    const mDur = atom.match(/^(.*):(\d+)$/);
    if (mDur) {
      const base = mDur[1];
      const count = parseInt(mDur[2], 10);
      tokens.push(base);
      for (let r = 1; r < count; r++) tokens.push('_');
    } else {
      // check for *N repeat suffix
      const m = atom.match(/^(.*)\*(\d+)$/);
      if (m) {
        const base = m[1];
        const count = parseInt(m[2], 10);
        for (let r = 0; r < count; r++) tokens.push(base);
      } else {
        tokens.push(atom);
      }
    }
    i = j;
  }

  return tokens;
}

export function transposePattern(tokens: string[], opts: { semitones?: number; octaves?: number }): string[] {
  const semitones = (opts.semitones || 0) + (opts.octaves || 0) * 12;
  if (semitones === 0) return tokens.slice();
  return tokens.map(t => {
    if (t === '.' || t === '_' || t === '-') return t;

    // Extract note from tokens with effects: E3<port:8> -> E3, <port:8>
    const effectMatch = t.match(/^([^<]+)(<.+>)?$/);
    if (effectMatch) {
      const notePart = effectMatch[1];
      const effectPart = effectMatch[2] || '';

      const midi = noteToMidi(notePart);
      if (midi === null) return t; // Not a note, return unchanged

      const transposedNote = midiToNote(midi + semitones);
      return transposedNote + effectPart; // Reconstruct with effects
    }

    // Fallback: try direct transpose
    const midi = noteToMidi(t);
    if (midi === null) return t;
    return midiToNote(midi + semitones);
  });
}

export default {
  expandPattern,
  transposePattern,
  noteToMidi,
  midiToNote,
};
