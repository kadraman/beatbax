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
const NOTE_BASE = {
    C: 0,
    'C#': 1,
    DB: 1,
    D: 2,
    'D#': 3,
    EB: 3,
    E: 4,
    F: 5,
    'F#': 6,
    GB: 6,
    G: 7,
    'G#': 8,
    AB: 8,
    A: 9,
    'A#': 10,
    BB: 10,
    B: 11,
};
function normalizeNoteName(name) {
    const m = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (!m)
        return null;
    const letter = m[1].toUpperCase();
    const accidental = m[2] || null;
    const octave = parseInt(m[3], 10);
    return { letter, accidental, octave };
}
export function noteToMidi(note) {
    const p = normalizeNoteName(note);
    if (!p)
        return null;
    const key = p.letter + (p.accidental ? (p.accidental === 'b' ? 'B' : '#') : '');
    const semitone = NOTE_BASE[key];
    if (semitone === undefined)
        return null;
    // MIDI: C4 = 60. So calculate from octave.
    // octave numbers follow scientific pitch: C4=60
    return (p.octave + 1) * 12 + semitone; // because octave -1 would be MIDI starting at C-1 = 0
}
export function midiToNote(n) {
    const octave = Math.floor(n / 12) - 1;
    const pitch = n % 12;
    const names = {
        0: 'C',
        1: 'C#',
        2: 'D',
        3: 'D#',
        4: 'E',
        5: 'F',
        6: 'F#',
        7: 'G',
        8: 'G#',
        9: 'A',
        10: 'A#',
        11: 'B',
    };
    return `${names[pitch]}${octave}`;
}
/** Expand a pattern string into an array of tokens.
 * Grammar (informal):
 *  pattern := item (WS item)*
 *  item := group ('*' number)? | token ('*' number)?
 *  group := '(' pattern ')'
 *  token := NOTE | '.' | IDENT
 */
export function expandPattern(text) {
    // Tokenize by spaces but keep parentheses and *number attached
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            i++;
            continue;
        }
        if (ch === '(') {
            // find matching ')'
            let depth = 1;
            let j = i + 1;
            while (j < text.length && depth > 0) {
                if (text[j] === '(')
                    depth++;
                else if (text[j] === ')')
                    depth--;
                j++;
            }
            const group = text.slice(i + 1, j - 1);
            // check for *N
            let k = j;
            let repeat = 1;
            if (text[k] === '*') {
                k++;
                const m = text.slice(k).match(/^\d+/);
                if (m) {
                    repeat = parseInt(m[0], 10);
                    k += m[0].length;
                }
            }
            // expand group recursively repeat times
            const expandedGroup = expandPattern(group);
            for (let r = 0; r < repeat; r++)
                tokens.push(...expandedGroup);
            i = k;
            continue;
        }
        // read until whitespace
        let j = i;
        while (j < text.length && !/\s/.test(text[j]))
            j++;
        let atom = text.slice(i, j);
        // check for *N repeat suffix
        const m = atom.match(/^(.*)\*(\d+)$/);
        if (m) {
            const base = m[1];
            const count = parseInt(m[2], 10);
            for (let r = 0; r < count; r++)
                tokens.push(base);
        }
        else {
            tokens.push(atom);
        }
        i = j;
    }
    return tokens;
}
export function transposePattern(tokens, opts) {
    const semitones = (opts.semitones || 0) + (opts.octaves || 0) * 12;
    if (semitones === 0)
        return tokens.slice();
    return tokens.map(t => {
        if (t === '.')
            return t;
        const midi = noteToMidi(t);
        if (midi === null)
            return t;
        return midiToNote(midi + semitones);
    });
}
export default {
    expandPattern,
    transposePattern,
    noteToMidi,
    midiToNote,
};
//# sourceMappingURL=expand.js.map