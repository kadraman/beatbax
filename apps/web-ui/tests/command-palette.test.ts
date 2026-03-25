/**
 * Command Palette — unit tests
 *
 * Covers two independently-testable areas:
 *   1. buildMultiPlaySource() — synthetic source generation and chunkInfo
 *   2. playSelection command — selection parsing dispatches to the right path
 */

import { buildMultiPlaySource } from '../src/editor/command-palette';
import { setupCommandPalette } from '../src/editor/command-palette';
import * as monaco from 'monaco-editor';

// ---------------------------------------------------------------------------
// Shared fixture source
// ---------------------------------------------------------------------------

const BASE_SOURCE = `chip gameboy
bpm 120
time 4
inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst sn    type=noise  env=12,down
pat melody   = C4 E4 G4 C5
pat bass_pat = C3 . G2 .
pat arp      = C5 E5 G5
pat fill     = A4 B4
seq main  = melody bass_pat
seq intro = melody
seq outro = arp fill
channel 1 => inst lead seq main
channel 2 => inst bass seq intro
play`;

// ---------------------------------------------------------------------------
// 1. buildMultiPlaySource
// ---------------------------------------------------------------------------

describe('buildMultiPlaySource', () => {
  // ── base-line preservation ────────────────────────────────────────────────

  it('preserves inst/pat/seq/bpm/time/chip lines and strips channel+play', () => {
    const { source } = buildMultiPlaySource(
      [{ name: 'main', kind: 'seq' }],
      BASE_SOURCE,
    );
    const lines = source.split('\n');
    expect(lines.some(l => /^chip gameboy/.test(l))).toBe(true);
    expect(lines.some(l => /^bpm 120/.test(l))).toBe(true);
    expect(lines.some(l => /^inst lead/.test(l))).toBe(true);
    expect(lines.some(l => /^pat melody/.test(l))).toBe(true);
    expect(lines.some(l => /^seq main/.test(l))).toBe(true);
    // old channel lines must not survive
    expect(lines.every(l => !/^channel 2 =>/.test(l))).toBe(true);
  });

  it('ends with a play directive', () => {
    const { source } = buildMultiPlaySource(
      [{ name: 'main', kind: 'seq' }],
      BASE_SOURCE,
    );
    const trimmedLines = source.split('\n').map(l => l.trim()).filter(Boolean);
    expect(trimmedLines[trimmedLines.length - 1]).toBe('play');
  });

  // ── single seq ────────────────────────────────────────────────────────────

  it("single seq: assigns to channel 1 with the seq's original instrument", () => {
    const { source, chunkInfo } = buildMultiPlaySource(
      [{ name: 'main', kind: 'seq' }],
      BASE_SOURCE,
    );
    expect(source).toMatch(/channel 1 => inst lead seq main/);
    expect(Object.keys(chunkInfo)).toHaveLength(0); // no merging → no chunkInfo
  });

  it("single seq: falls back to first declared inst when seq has no channel assignment", () => {
    const src = BASE_SOURCE.replace('channel 1 => inst lead seq main', '');
    const { source } = buildMultiPlaySource(
      [{ name: 'main', kind: 'seq' }],
      src,
    );
    // 'lead' is the first inst declared, so it should be the fallback
    expect(source).toMatch(/channel 1 => inst lead seq main/);
  });

  // ── multiple seqs, within channel limit ──────────────────────────────────

  it('two seqs within limit: each on its own channel', () => {
    const { source, chunkInfo } = buildMultiPlaySource(
      [{ name: 'main', kind: 'seq' }, { name: 'intro', kind: 'seq' }],
      BASE_SOURCE,
    );
    expect(source).toMatch(/channel 1 => inst lead seq main/);
    expect(source).toMatch(/channel 2 => inst bass seq intro/);
    expect(Object.keys(chunkInfo)).toHaveLength(0);
  });

  it('four seqs on gameboy: fills all 4 channels without merging', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4
pat b = G4 B4
pat c = C5 E5
pat d = G5 B5
seq s1 = a
seq s2 = b
seq s3 = c
seq s4 = d
channel 1 => inst lead seq s1
channel 2 => inst lead seq s2
channel 3 => inst lead seq s3
channel 4 => inst lead seq s4
play`;
    const { source, chunkInfo } = buildMultiPlaySource(
      [
        { name: 's1', kind: 'seq' },
        { name: 's2', kind: 'seq' },
        { name: 's3', kind: 'seq' },
        { name: 's4', kind: 'seq' },
      ],
      src,
    );
    expect(source).toMatch(/channel 1 => inst lead seq s1/);
    expect(source).toMatch(/channel 2 => inst lead seq s2/);
    expect(source).toMatch(/channel 3 => inst lead seq s3/);
    expect(source).toMatch(/channel 4 => inst lead seq s4/);
    expect(Object.keys(chunkInfo)).toHaveLength(0);
  });

  // ── overflow / merging ────────────────────────────────────────────────────

  it('five seqs on gameboy: merges round-robin into 4 channels and emits chunkInfo', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4
pat b = G4 B4
pat c = C5 E5
pat d = G5 B5
pat e = D4 F4
seq s1 = a
seq s2 = b
seq s3 = c
seq s4 = d
seq s5 = e
channel 1 => inst lead seq s1
channel 2 => inst lead seq s2
channel 3 => inst lead seq s3
channel 4 => inst lead seq s4
play`;
    const { source, chunkInfo } = buildMultiPlaySource(
      [
        { name: 's1', kind: 'seq' },
        { name: 's2', kind: 'seq' },
        { name: 's3', kind: 'seq' },
        { name: 's4', kind: 'seq' },
        { name: 's5', kind: 'seq' },
      ],
      src,
    );

    // s1 (slot 0) + s5 (slot 0, overflow) → merged on channel 1
    expect(chunkInfo[1]).toBeDefined();
    expect(chunkInfo[1]).toHaveLength(2);
    expect(chunkInfo[1][0].seqName).toBe('s1');
    expect(chunkInfo[1][1].seqName).toBe('s5');

    // Channels 2-4 have exactly one seq each → no chunkInfo entry
    expect(chunkInfo[2]).toBeUndefined();
    expect(chunkInfo[3]).toBeUndefined();
    expect(chunkInfo[4]).toBeUndefined();

    // Merged seq for channel 1 should contain both pattern bodies
    const lines = source.split('\n');
    const mergedSeqLine = lines.find(l => /^seq s1\s*=/.test(l));
    expect(mergedSeqLine).toBeDefined();
    // body should have both original pattern references
    expect(mergedSeqLine).toMatch(/\ba\b/);
    expect(mergedSeqLine).toMatch(/\be\b/);
  });

  it('chunkInfo noteCount equals per-seq note-token count (not rest count)', () => {
    // melody = C4 E4 G4 C5 → 4 notes; intro = melody → 4 notes via seq ref
    // mais intro body is just "melody" and melody has 4 note tokens
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat melody = C4 E4 G4 C5
pat bass_pat = C3 . G2 .
seq main  = melody bass_pat
seq intro = melody
seq outro = bass_pat
seq extra = melody bass_pat melody
channel 1 => inst lead seq main
channel 2 => inst lead seq intro
channel 3 => inst lead seq outro
channel 4 => inst lead seq extra
play`;
    const { chunkInfo } = buildMultiPlaySource(
      [
        { name: 'main', kind: 'seq' },
        { name: 'intro', kind: 'seq' },
        { name: 'outro', kind: 'seq' },
        { name: 'extra', kind: 'seq' },
        // 5th seq → forces overflow merge onto channel 1 alongside 'main'
        { name: 'intro', kind: 'seq' },
      ],
      src,
    );

    const ch1Chunks = chunkInfo[1];
    expect(ch1Chunks).toBeDefined();
    // First chunk is 'main' = melody(4 notes) + bass_pat(2 notes: C3, G2) = 6
    expect(ch1Chunks[0].seqName).toBe('main');
    expect(ch1Chunks[0].noteCount).toBe(6);
    // Second chunk is 'intro' = melody(4 notes) = 4
    expect(ch1Chunks[1].seqName).toBe('intro');
    expect(ch1Chunks[1].noteCount).toBe(4);
  });

  it('chunkInfo patNames lists pattern names in seq body order, deduped', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4
pat b = E4
pat c = G4
seq s1 = a b a c
seq s2 = b c
channel 1 => inst lead seq s1
channel 2 => inst lead seq s2
channel 3 => inst lead seq s1
channel 4 => inst lead seq s2
play`;

    const { chunkInfo } = buildMultiPlaySource(
      [
        { name: 's1', kind: 'seq' },
        { name: 's2', kind: 'seq' },
        { name: 's1', kind: 'seq' },
        { name: 's2', kind: 'seq' },
        { name: 's1', kind: 'seq' }, // 5th → overflow
      ],
      src,
    );

    const ch1 = chunkInfo[1];
    expect(ch1).toBeDefined();
    // s1 patNames should be deduped: a, b, c (first occurrence order)
    expect(ch1[0].patNames).toEqual(['a', 'b', 'c']);
  });

  // ── chip-aware channel limit ──────────────────────────────────────────────

  it('respects NES 5-channel limit', () => {
    const src = `chip nes
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4
seq s1 = a
seq s2 = a
seq s3 = a
seq s4 = a
seq s5 = a
seq s6 = a
channel 1 => inst lead seq s1
play`;
    const { source, chunkInfo } = buildMultiPlaySource(
      [
        { name: 's1', kind: 'seq' },
        { name: 's2', kind: 'seq' },
        { name: 's3', kind: 'seq' },
        { name: 's4', kind: 'seq' },
        { name: 's5', kind: 'seq' },
        { name: 's6', kind: 'seq' }, // 6th → overflow onto channel 1
      ],
      src,
    );

    const channelLines = source.split('\n').filter(l => /^channel \d+ =>/.test(l));
    // Should produce at most 5 channel lines
    expect(channelLines.length).toBeLessThanOrEqual(5);
    // s6 overflow merges with s1 on channel 1
    expect(chunkInfo[1]).toBeDefined();
    expect(chunkInfo[1]).toHaveLength(2);
  });

  // ── pat-only items ────────────────────────────────────────────────────────

  it('pat-only items: chains into a synthetic __multi__ seq on channel 1', () => {
    const { source, chunkInfo } = buildMultiPlaySource(
      [{ name: 'melody', kind: 'pat' }, { name: 'bass_pat', kind: 'pat' }],
      BASE_SOURCE,
    );
    expect(source).toMatch(/seq __multi__ = melody bass_pat/);
    expect(source).toMatch(/channel 1 => inst lead seq __multi__/);
    expect(Object.keys(chunkInfo)).toHaveLength(0);
  });

  it('mixed seq+pat: seqs fill channels first, pats go on the next available channel', () => {
    const { source } = buildMultiPlaySource(
      [
        { name: 'main', kind: 'seq' },
        { name: 'intro', kind: 'seq' },
        { name: 'melody', kind: 'pat' },
      ],
      BASE_SOURCE,
    );
    // Seqs on channels 1 and 2
    expect(source).toMatch(/channel 1 => inst lead seq main/);
    expect(source).toMatch(/channel 2 => inst bass seq intro/);
    // Pat chain on channel 3
    expect(source).toMatch(/channel 3 => inst lead seq __multi__/);
  });

  // ── no chip directive ─────────────────────────────────────────────────────

  it('defaults to 4 channels when no chip directive is present', () => {
    const noChip = BASE_SOURCE.replace(/^chip gameboy\n/m, '');
    const { source } = buildMultiPlaySource(
      [
        { name: 'main', kind: 'seq' },
        { name: 'intro', kind: 'seq' },
        { name: 'outro', kind: 'seq' },
        { name: 'main', kind: 'seq' }, // 4th
        { name: 'intro', kind: 'seq' }, // 5th → overflow
      ],
      noChip,
    );
    const channelLines = source.split('\n').filter(l => /^channel \d+ =>/.test(l));
    expect(channelLines.length).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// 2. playSelection command — selection-parsing dispatch
// ---------------------------------------------------------------------------

describe('setupCommandPalette — playSelection dispatch', () => {
  let mockEditor: any;
  let playRawCalls: Array<[string, any]>;
  let triggerCalls: Array<[string, string, any]>;
  let registeredActions: Map<string, (arg?: any) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    playRawCalls = [];
    triggerCalls = [];
    registeredActions = new Map();

    mockEditor = {
      addAction: jest.fn((descriptor: any) => {
        registeredActions.set(descriptor.id, descriptor.run);
        return { dispose: jest.fn() };
      }),
      getDomNode: jest.fn(() => document.createElement('div')),
      getSelection: jest.fn(() => ({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: 1, endColumn: 10,
      })),
      getModel: jest.fn(() => ({
        getValueInRange: jest.fn((range: any) => selectionText),
      })),
      trigger: jest.fn((_src: string, cmd: string, arg: any) => {
        triggerCalls.push([_src, cmd, arg]);
      }),
      executeEdits: jest.fn(),
      focus: jest.fn(),
    };

    let selectionText = '';

    const opts = {
      editor: mockEditor,
      getSource: () => BASE_SOURCE,
      onExport: jest.fn(),
      onVerify: jest.fn(),
      onToggleMute: jest.fn(),
      onToggleSolo: jest.fn(),
      onPlayRaw: jest.fn((src: string, info?: any) => {
        playRawCalls.push([src, info]);
      }),
    };

    setupCommandPalette(opts);

    // Helper to run the play-selection command with a given editor selection text
    (mockEditor as any).__setSelection = (text: string) => {
      selectionText = text;
      mockEditor.getModel.mockReturnValue({
        getValueInRange: jest.fn(() => text),
      });
    };
  });

  function runPlaySelection() {
    const run = registeredActions.get('beatbax.playSelection');
    expect(run).toBeDefined();
    run!();
  }

  // ── raw note tokens ───────────────────────────────────────────────────────

  it('raw notes: calls onPlayRaw with a synthetic one-channel source', () => {
    (mockEditor as any).__setSelection('C4 E4 G4');
    runPlaySelection();

    expect(playRawCalls).toHaveLength(1);
    const [src, info] = playRawCalls[0];
    expect(src).toMatch(/pat __sel__ = C4 E4 G4/);
    expect(src).toMatch(/channel 1 =>/);
    expect(src).toMatch(/play/);
    expect(info).toBeUndefined();
  });

  // ── single identifier lookup ──────────────────────────────────────────────

  it('bare seq identifier: triggers beatbax.previewSeq', () => {
    (mockEditor as any).__setSelection('main');
    runPlaySelection();

    const seqTrigger = triggerCalls.find(([, cmd]) => cmd === 'beatbax.previewSeq');
    expect(seqTrigger).toBeDefined();
    expect(seqTrigger![2]).toBe('main');
  });

  it('bare pat identifier: triggers beatbax.previewPattern', () => {
    (mockEditor as any).__setSelection('melody');
    runPlaySelection();

    const patTrigger = triggerCalls.find(([, cmd]) => cmd === 'beatbax.previewPattern');
    expect(patTrigger).toBeDefined();
    expect(patTrigger![2]).toBe('melody');
  });

  // ── inline definitions in selection ──────────────────────────────────────

  it('single inline pat definition: triggers beatbax.previewPattern', () => {
    (mockEditor as any).__setSelection('pat melody = C4 E4 G4 C5');
    runPlaySelection();

    const patTrigger = triggerCalls.find(([, cmd]) => cmd === 'beatbax.previewPattern');
    expect(patTrigger).toBeDefined();
    expect(patTrigger![2]).toBe('melody');
  });

  it('single inline seq definition: triggers beatbax.previewSeq', () => {
    (mockEditor as any).__setSelection('seq main = melody bass_pat');
    runPlaySelection();

    const seqTrigger = triggerCalls.find(([, cmd]) => cmd === 'beatbax.previewSeq');
    expect(seqTrigger).toBeDefined();
    expect(seqTrigger![2]).toBe('main');
  });

  it('multiple inline definitions: calls onPlayRaw with multi-channel source', () => {
    (mockEditor as any).__setSelection(
      'seq main = melody bass_pat\nseq intro = melody',
    );
    runPlaySelection();

    expect(playRawCalls).toHaveLength(1);
    const [src] = playRawCalls[0];
    expect(src).toMatch(/channel 1 =>/);
    expect(src).toMatch(/channel 2 =>/);
  });

  it('multiple inline definitions: passes chunkInfo only when merging occurs', () => {
    // Two seqs within the gameboy 4-channel limit → no chunkInfo
    (mockEditor as any).__setSelection(
      'seq main = melody bass_pat\nseq intro = melody',
    );
    runPlaySelection();

    const [, info] = playRawCalls[0];
    // chunkInfo is undefined when nothing was merged
    expect(info).toBeUndefined();
  });

  // ── empty / no selection ──────────────────────────────────────────────────

  it('empty selection: does nothing', () => {
    (mockEditor as any).__setSelection('');
    runPlaySelection();

    expect(playRawCalls).toHaveLength(0);
    expect(triggerCalls).toHaveLength(0);
  });
});
