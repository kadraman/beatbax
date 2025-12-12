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
export declare function noteToMidi(note: string): number | null;
export declare function midiToNote(n: number): string;
/** Expand a pattern string into an array of tokens.
 * Grammar (informal):
 *  pattern := item (WS item)*
 *  item := group ('*' number)? | token ('*' number)?
 *  group := '(' pattern ')'
 *  token := NOTE | '.' | IDENT
 */
export declare function expandPattern(text: string): string[];
export declare function transposePattern(tokens: string[], opts: {
    semitones?: number;
    octaves?: number;
}): string[];
declare const _default: {
    expandPattern: typeof expandPattern;
    transposePattern: typeof transposePattern;
    noteToMidi: typeof noteToMidi;
    midiToNote: typeof midiToNote;
};
export default _default;
//# sourceMappingURL=expand.d.ts.map