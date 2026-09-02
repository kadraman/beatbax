/**
 * Unit tests for pure BeatBax command context state computation.
 */

import {
  computeCommandContextState,
  resolveGotoDefinitionTarget,
} from '../src/editor/command-context';

const SAMPLE = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat melody = C4 E4 G4
seq main = melody
channel 1 => inst lead seq main
play
`;

const SUBPAT_SAMPLE = `chip gameboy
subpat kick_body =
  . +0 vol:15 halt
inst kick type=noise subpat=kick_body
pat melody = C4
seq main = melody
channel 1 => inst kick seq main
play
`;

describe('computeCommandContextState', () => {
  it('detects definition lines and channel lines', () => {
    const onPat = computeCommandContextState(SAMPLE, { lineNumber: 4, column: 1 }, false);
    expect(onPat.onPatDefLine).toBe(true);
    expect(onPat.onSeqDefLine).toBe(false);

    const onSeq = computeCommandContextState(SAMPLE, { lineNumber: 5, column: 1 }, false);
    expect(onSeq.onSeqDefLine).toBe(true);

    const onCh = computeCommandContextState(SAMPLE, { lineNumber: 6, column: 1 }, false);
    expect(onCh.onChannelLine).toBe(true);
  });

  it('resolves pat / seq / inst identifiers under the cursor', () => {
    // column on "melody" in "pat melody = ..."
    const patNameCol = 'pat melody'.length; // ends on y
    const pat = computeCommandContextState(SAMPLE, { lineNumber: 4, column: patNameCol }, false);
    expect(pat.hasPatIdent).toBe(true);

    const seqRef = computeCommandContextState(SAMPLE, { lineNumber: 6, column: 'channel 1 => inst lead seq mai'.length }, false);
    expect(seqRef.hasSeqIdent).toBe(true);

    const instRef = computeCommandContextState(SAMPLE, { lineNumber: 6, column: 'channel 1 => inst lea'.length }, false);
    expect(instRef.hasInstIdent).toBe(true);
  });

  it('mirrors selection and feature flags', () => {
    const state = computeCommandContextState(
      SAMPLE,
      { lineNumber: 1, column: 1 },
      true,
      { patternGrid: true, copilot: true, midi: true },
    );
    expect(state.hasSelection).toBe(true);
    expect(state.patternGrid).toBe(true);
    expect(state.copilot).toBe(true);
    expect(state.midi).toBe(true);
  });

  it('returns falsey defaults with no position', () => {
    const state = computeCommandContextState(SAMPLE, null, false);
    expect(state.hasPatIdent).toBe(false);
    expect(state.onPatDefLine).toBe(false);
    expect(state.onChannelLine).toBe(false);
    expect(state.canGotoDefinition).toBe(false);
    expect(state.hasNamedSymbol).toBe(false);
  });
});

describe('hasNamedSymbol', () => {
  it('is true for pat / seq / inst / subpat identifiers under the cursor', () => {
    const pat = computeCommandContextState(SAMPLE, { lineNumber: 4, column: 'pat melody'.length }, false);
    expect(pat.hasNamedSymbol).toBe(true);

    const seqRef = computeCommandContextState(
      SAMPLE,
      { lineNumber: 6, column: 'channel 1 => inst lead seq mai'.length },
      false,
    );
    expect(seqRef.hasNamedSymbol).toBe(true);

    const subpatRef = computeCommandContextState(
      SUBPAT_SAMPLE,
      { lineNumber: 4, column: 'inst kick type=noise subpat=kick_bo'.length },
      false,
    );
    expect(subpatRef.hasNamedSymbol).toBe(true);
  });
});

describe('resolveGotoDefinitionTarget', () => {
  it('hides goto when already on pat / seq / inst definition names', () => {
    const patNameCol = 'pat melody'.length;
    expect(resolveGotoDefinitionTarget(SAMPLE, { lineNumber: 4, column: patNameCol })).toBeNull();

    const seqNameCol = 'seq main'.length;
    expect(resolveGotoDefinitionTarget(SAMPLE, { lineNumber: 5, column: seqNameCol })).toBeNull();

    const instNameCol = 'inst lead'.length;
    expect(resolveGotoDefinitionTarget(SAMPLE, { lineNumber: 3, column: instNameCol })).toBeNull();
  });

  it('resolves references from channel and sequence definition lines', () => {
    expect(resolveGotoDefinitionTarget(SAMPLE, {
      lineNumber: 6,
      column: 'channel 1 => inst lead seq mai'.length,
    })).toEqual({ kind: 'seq', name: 'main' });

    expect(resolveGotoDefinitionTarget(SAMPLE, {
      lineNumber: 5,
      column: 'seq main = melo'.length,
    })).toEqual({ kind: 'pat', name: 'melody' });
  });

  it('resolves subpat references from instrument lines', () => {
    const refCol = 'inst kick type=noise subpat=kick_bo'.length;
    expect(resolveGotoDefinitionTarget(SUBPAT_SAMPLE, { lineNumber: 4, column: refCol })).toEqual({
      kind: 'subpat',
      name: 'kick_body',
    });
    expect(computeCommandContextState(SUBPAT_SAMPLE, { lineNumber: 4, column: refCol }, false).canGotoDefinition)
      .toBe(true);
  });

  it('hides goto when already on subpat definition', () => {
    const defCol = 'subpat kick_body'.length;
    expect(resolveGotoDefinitionTarget(SUBPAT_SAMPLE, { lineNumber: 2, column: defCol })).toBeNull();
  });
});
