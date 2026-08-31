/**
 * Arrangement-slice builder unit tests.
 */

import {
  buildArrangementSliceSource,
  findArrangementSliceAnchorByName,
  findArrangementSliceAnchorAtCursor,
  findArrangementSliceAnchorBySectionIdentity,
  normalizeSectionHeadword,
  resolveArrangementHintAtCursor,
  findAdjacentSectionAnchor,
  listArrangementSections,
  buildChannelTimelines,
  findSectionCommentAbove,
  resolveSectionFocus,
  resolveSliceWindow,
  segmentMatchesSectionFocus,
  collectPhaseSeqNames,
  collectPhaseSeqNamesFromSource,
  expandContiguousSeqDefinitionLines,
  detectArrangementLayout,
  findFirstChannelLine,
} from '../src/editor/arrangement-slice';
import { getArrangementLayoutDiagnostics } from '../src/editor/arrangement-diagnostics';
import { explainPhasedRestructureUnavailable, restructurePhasedSections } from '../src/editor/arrangement-restructure';

const HEROES_SHAPED = `chip gameboy
bpm 120
inst hero_bright type=pulse1 duty=50 env=12,down
inst chord_bright type=pulse2 duty=25 env=10,down
inst deep_bass type=wave wave=[0,2,4,6,8,10,12,14,15,14,12,10,8,6,4,2]
inst kick type=noise env=12,down
pat theme_a = C4 E4 G4 C5
pat theme_b = E4 G4 B4 E5
pat harm_a = C3 E3 G3 C4
pat harm_b = E3 G3 B3 E4
pat bass_a = C2 . G2 .
pat bass_b = E2 . B1 .
pat drums_a = kick . sn . 
pat drums_b = kick sn kick sn
seq theme_mel = theme_a theme_b
seq theme_harm = harm_a harm_b
seq theme_bass = bass_a bass_b
seq theme_perc = drums_a drums_b
seq fanfare_mel = theme_a
seq fanfare_harm = harm_a
seq fanfare_bass = bass_a
seq fanfare_perc = drums_a
channel 1 => inst hero_bright seq fanfare_mel theme_mel
channel 2 => inst chord_bright seq fanfare_harm theme_harm
channel 3 => inst deep_bass seq fanfare_bass theme_bass
channel 4 => inst kick seq fanfare_perc theme_perc
play`;

/** Minimal song/ast shaped like resolveSong output for the fixture above. */
function heroesSongAst() {
  const pats: Record<string, string[]> = {
    theme_a: ['C4', 'E4', 'G4', 'C5'],
    theme_b: ['E4', 'G4', 'B4', 'E5'],
    harm_a: ['C3', 'E3', 'G3', 'C4'],
    harm_b: ['E3', 'G3', 'B3', 'E4'],
    bass_a: ['C2', '.', 'G2', '.'],
    bass_b: ['E2', '.', 'B1', '.'],
    drums_a: ['kick', '.', 'sn', '.'],
    drums_b: ['kick', 'sn', 'kick', 'sn'],
  };
  const seqs: Record<string, string[]> = {
    theme_mel: ['theme_a', 'theme_b'],
    theme_harm: ['harm_a', 'harm_b'],
    theme_bass: ['bass_a', 'bass_b'],
    theme_perc: ['drums_a', 'drums_b'],
    fanfare_mel: ['theme_a'],
    fanfare_harm: ['harm_a'],
    fanfare_bass: ['bass_a'],
    fanfare_perc: ['drums_a'],
  };
  const ast = {
    seqs,
    channels: [
      { id: 1, inst: 'hero_bright', seqSpecTokens: ['fanfare_mel', 'theme_mel'] },
      { id: 2, inst: 'chord_bright', seqSpecTokens: ['fanfare_harm', 'theme_harm'] },
      { id: 3, inst: 'deep_bass', seqSpecTokens: ['fanfare_bass', 'theme_bass'] },
      { id: 4, inst: 'kick', seqSpecTokens: ['fanfare_perc', 'theme_perc'] },
    ],
  };
  const song = {
    chip: 'gameboy',
    pats,
    channels: [
      { id: 1, defaultInstrument: 'hero_bright', events: [] },
      { id: 2, defaultInstrument: 'chord_bright', events: [] },
      { id: 3, defaultInstrument: 'deep_bass', events: [] },
      { id: 4, defaultInstrument: 'kick', events: [] },
    ],
  };
  return { song, ast };
}

describe('buildArrangementSliceSource', () => {
  it('heroes_call-shaped: clicking theme_mel emits four theme_* channels with original instruments', () => {
    const { song, ast } = heroesSongAst();
    const timelines = buildChannelTimelines(HEROES_SHAPED, song, ast);
    const ch1 = timelines.find((t) => t.channelId === 1)!;
    const themeSeg = ch1.segments.find((s) => s.seqName === 'theme_mel')!;
    expect(themeSeg).toBeDefined();

    const result = buildArrangementSliceSource(HEROES_SHAPED, song, ast, {
      channelId: 1,
      startStep: themeSeg.startStep,
      endStep: themeSeg.endStep,
      seqName: 'theme_mel',
      patName: themeSeg.patName,
    });

    expect(result).not.toBeNull();
    const lines = result!.source.split('\n');
    expect(lines.some((l) => /^channel 1 => inst hero_bright seq theme_mel$/.test(l))).toBe(true);
    expect(lines.some((l) => /^channel 2 => inst chord_bright seq theme_harm$/.test(l))).toBe(true);
    expect(lines.some((l) => /^channel 3 => inst deep_bass seq theme_bass$/.test(l))).toBe(true);
    expect(lines.some((l) => /^channel 4 => inst kick seq theme_perc$/.test(l))).toBe(true);
    expect(lines.filter((l) => /^channel /.test(l)).every((l) => !/fanfare_/.test(l))).toBe(true);
    expect(lines.filter((l) => /^channel /.test(l))).toHaveLength(4);
    expect(lines[lines.length - 1].trim()).toBe('play');
  });

  it('pat-only channel: slice is that one pat window on overlapping channels', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
pat intro = C4 E4
pat verse = G4 A4
pat bass_i = C3 .
pat bass_v = G2 .
channel 1 => inst lead pat intro verse
channel 2 => inst bass pat bass_i bass_v
play`;
    const pats = {
      intro: ['C4', 'E4'],
      verse: ['G4', 'A4'],
      bass_i: ['C3', '.'],
      bass_v: ['G2', '.'],
    };
    const ast = {
      seqs: {},
      channels: [
        { id: 1, inst: 'lead', pat: 'intro verse' },
        { id: 2, inst: 'bass', pat: 'bass_i bass_v' },
      ],
    };
    const song = {
      pats,
      channels: [
        { id: 1, defaultInstrument: 'lead', events: [] },
        { id: 2, defaultInstrument: 'bass', events: [] },
      ],
    };

    const timelines = buildChannelTimelines(src, song, ast);
    const verse = timelines[0].segments.find((s) => s.patName === 'verse')!;
    const result = buildArrangementSliceSource(src, song, ast, {
      channelId: 1,
      startStep: verse.startStep,
      endStep: verse.endStep,
      seqName: null,
      patName: 'verse',
    });

    expect(result).not.toBeNull();
    const channelLines = result!.source.split('\n').filter((l) => /^channel /.test(l) || /^seq __slice_/.test(l));
    const channelSrc = channelLines.join('\n');
    expect(channelSrc).toMatch(/channel 1 => inst lead/);
    expect(channelSrc).toMatch(/verse/);
    expect(channelSrc).toMatch(/channel 2 => inst bass/);
    expect(channelSrc).toMatch(/bass_v/);
    expect(channelSrc).not.toMatch(/\bintro\b/);
    expect(channelSrc).not.toMatch(/\bbass_i\b/);
  });

  it('partial seq window: emits overlapping pats, not the full parent sequence', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4 G4 C5
pat b = E4 G4 B4 E5
pat c = G4 A4 B4 C5
pat d = C5 D5 E5 G5
seq long = a b c d
channel 1 => inst lead seq long
play`;
    const pats = {
      a: ['C4', 'E4', 'G4', 'C5'],
      b: ['E4', 'G4', 'B4', 'E5'],
      c: ['G4', 'A4', 'B4', 'C5'],
      d: ['C5', 'D5', 'E5', 'G5'],
    };
    const ast = {
      seqs: { long: ['a', 'b', 'c', 'd'] },
      channels: [{ id: 1, inst: 'lead', seqSpecTokens: ['long'] }],
    };
    const song = {
      pats,
      channels: [{ id: 1, defaultInstrument: 'lead', events: [] }],
    };

    const timelines = buildChannelTimelines(src, song, ast);
    const cSeg = timelines[0].segments.find((s) => s.patName === 'c')!;
    expect(cSeg.startStep).toBe(8);
    expect(cSeg.endStep).toBe(12);

    const result = buildArrangementSliceSource(src, song, ast, {
      channelId: 1,
      startStep: cSeg.startStep,
      endStep: cSeg.endStep,
      seqName: null,
      patName: 'c',
    });

    expect(result).not.toBeNull();
    const channelLines = result!.source.split('\n').filter((l) => /^channel /.test(l));
    expect(channelLines.some((l) => /seq long\b/.test(l))).toBe(false);
    expect(result!.source).toMatch(/seq __slice_ch1__ = c/);
    expect(result!.source).toMatch(/channel 1 => inst lead seq __slice_ch1__/);
  });

  it('cross-channel: longer seq covering the window emits pats, not the full sequence', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
pat a = C4 E4 G4 C5
pat b = E4 G4 B4 E5
pat c = G4 A4 B4 C5
pat d = C5 D5 E5 G5
pat ba = C2 . G2 .
pat bb = E2 . B1 .
pat bc = G2 . D2 .
pat bd = A1 . E1 .
pat be = B1 . F1 .
seq section = a b c d
seq section_bass = ba bb bc bd be
channel 1 => inst lead seq section
channel 2 => inst bass seq section_bass
play`;
    const pats = {
      a: ['C4', 'E4', 'G4', 'C5'],
      b: ['E4', 'G4', 'B4', 'E5'],
      c: ['G4', 'A4', 'B4', 'C5'],
      d: ['C5', 'D5', 'E5', 'G5'],
      ba: ['C2', '.', 'G2', '.'],
      bb: ['E2', '.', 'B1', '.'],
      bc: ['G2', '.', 'D2', '.'],
      bd: ['A1', '.', 'E1', '.'],
      be: ['B1', '.', 'F1', '.'],
    };
    const ast = {
      seqs: { section: ['a', 'b', 'c', 'd'], section_bass: ['ba', 'bb', 'bc', 'bd', 'be'] },
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['section'] },
        { id: 2, inst: 'bass', seqSpecTokens: ['section_bass'] },
      ],
    };
    const song = {
      pats,
      channels: [
        { id: 1, defaultInstrument: 'lead', events: [] },
        { id: 2, defaultInstrument: 'bass', events: [] },
      ],
    };

    const timelines = buildChannelTimelines(src, song, ast);
    const sectionSeg = timelines[0].segments.find((s) => s.seqName === 'section')!;
    const result = buildArrangementSliceSource(src, song, ast, {
      channelId: 1,
      startStep: sectionSeg.startStep,
      endStep: sectionSeg.endStep,
      seqName: 'section',
      patName: sectionSeg.patName,
    });

    expect(result).not.toBeNull();
    expect(result!.source).toMatch(/channel 1 => inst lead seq section/);
    expect(result!.source).not.toMatch(/channel 2 => inst bass seq section_bass/);
    expect(result!.source).toMatch(/seq __slice_ch2__ = ba bb bc bd/);
  });

  it('mismatched lengths: overlapping whole pats included without crash', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
pat short = C4 E4
pat long = C3 E3 G3 B3 C4 E4 G4 B4
seq a = short
seq b = long
channel 1 => inst lead seq a
channel 2 => inst bass seq b
play`;
    const pats = {
      short: ['C4', 'E4'],
      long: ['C3', 'E3', 'G3', 'B3', 'C4', 'E4', 'G4', 'B4'],
    };
    const ast = {
      seqs: { a: ['short'], b: ['long'] },
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['a'] },
        { id: 2, inst: 'bass', seqSpecTokens: ['b'] },
      ],
    };
    const song = {
      pats,
      channels: [
        { id: 1, defaultInstrument: 'lead', events: [] },
        { id: 2, defaultInstrument: 'bass', events: [] },
      ],
    };

    const timelines = buildChannelTimelines(src, song, ast);
    const shortSeg = timelines[0].segments[0];
    const result = buildArrangementSliceSource(src, song, ast, {
      channelId: 1,
      startStep: shortSeg.startStep,
      endStep: shortSeg.endStep,
      seqName: 'a',
      patName: 'short',
    });

    expect(result).not.toBeNull();
    expect(result!.source).toMatch(/channel 1 =>/);
    expect(result!.source).toMatch(/channel 2 =>/);
    expect(result!.misaligned).toBe(true);
    expect(result!.warning).toMatch(/extend past/i);
  });

  it('loop option emits play auto repeat', () => {
    const { song, ast } = heroesSongAst();
    const timelines = buildChannelTimelines(HEROES_SHAPED, song, ast);
    const themeSeg = timelines[0].segments.find((s) => s.seqName === 'theme_mel')!;
    const result = buildArrangementSliceSource(
      HEROES_SHAPED,
      song,
      ast,
      {
        channelId: 1,
        startStep: themeSeg.startStep,
        endStep: themeSeg.endStep,
        seqName: 'theme_mel',
        patName: themeSeg.patName,
      },
      { loop: true },
    );
    expect(result!.source.trim().endsWith('play auto repeat')).toBe(true);
  });

  it('transformed seq items use expanded step counts for timeline positions', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
pat riff = C4 D4 E4 G4
pat bassline = C2 . G2 .
seq section_slow = riff:slow(2)
seq section_plain = riff bassline
seq section_pal = riff:pal
channel 1 => inst lead seq section_slow section_plain
channel 2 => inst bass seq section_slow section_plain
play`;
    const pats = {
      riff: ['C4', 'D4', 'E4', 'G4'],
      bassline: ['C2', '.', 'G2', '.'],
    };
    const ast = {
      seqs: {
        section_slow: ['riff:slow(2)'],
        section_plain: ['riff', 'bassline'],
        section_pal: ['riff:pal'],
      },
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['section_slow', 'section_plain'] },
        { id: 2, inst: 'bass', seqSpecTokens: ['section_slow', 'section_plain'] },
      ],
    };
    const song = {
      pats,
      channels: [
        { id: 1, defaultInstrument: 'lead', events: [] },
        { id: 2, defaultInstrument: 'bass', events: [] },
      ],
    };

    const timelines = buildChannelTimelines(src, song, ast);
    const ch1Slow = timelines[0].segments.find((s) => s.seqName === 'section_slow')!;
    expect(ch1Slow.endStep - ch1Slow.startStep).toBe(8);
    const ch1Plain = timelines[0].segments.find((s) => s.seqName === 'section_plain' && s.patName === 'riff')!;
    expect(ch1Plain.startStep).toBe(8);
    expect(timelines[1].segments.find((s) => s.seqName === 'section_plain')!.startStep).toBe(8);

    const palTimelines = buildChannelTimelines(
      src.replace(
        'channel 2 => inst bass seq section_slow section_plain',
        'channel 2 => inst bass seq section_pal',
      ),
      {
        ...song,
        channels: [
          song.channels[0],
          { id: 2, defaultInstrument: 'bass', events: [] },
        ],
      },
      {
        ...ast,
        channels: [
          ast.channels[0],
          { id: 2, inst: 'bass', seqSpecTokens: ['section_pal'] },
        ],
      },
    );
    const palSeg = palTimelines[1].segments.find((s) => s.seqName === 'section_pal')!;
    expect(palSeg.endStep - palSeg.startStep).toBe(7);
  });

  it('preserves subpat declarations and indented rows in synthetic source', () => {
    const src = `chip gameboy
bpm 120
subpat prism_lead_sub =
  timbre:160
  fx:2,4
inst prism_lead type=pulse1 duty=50 env=12,down subpat=prism_lead_sub
pat lead_a = C5 E5
pat lead_b = G5 A5
seq theme = lead_a lead_b
channel 1 => inst prism_lead seq theme
play`;
    const pats = {
      lead_a: ['C5', 'E5'],
      lead_b: ['G5', 'A5'],
    };
    const ast = {
      seqs: { theme: ['lead_a', 'lead_b'] },
      channels: [{ id: 1, inst: 'prism_lead', seqSpecTokens: ['theme'] }],
    };
    const song = {
      pats,
      channels: [{ id: 1, defaultInstrument: 'prism_lead', events: [] }],
    };
    const timelines = buildChannelTimelines(src, song, ast);
    const themeSeg = timelines[0].segments.find((s) => s.seqName === 'theme')!;
    const result = buildArrangementSliceSource(src, song, ast, {
      channelId: 1,
      startStep: themeSeg.startStep,
      endStep: themeSeg.endStep,
      seqName: 'theme',
      patName: themeSeg.patName,
    });
    expect(result).not.toBeNull();
    expect(result!.source).toMatch(/subpat prism_lead_sub/);
    expect(result!.source).toMatch(/timbre:160/);
    expect(result!.source).toMatch(/fx:2,4/);
    expect(result!.source).toMatch(/inst prism_lead.*subpat=prism_lead_sub/);
  });

  it('findArrangementSliceAnchorByName resolves theme_mel on channel 1', () => {
    const { song, ast } = heroesSongAst();
    const anchor = findArrangementSliceAnchorByName(HEROES_SHAPED, song, ast, 'theme_mel');
    expect(anchor).toEqual(expect.objectContaining({
      channelId: 1,
      seqName: 'theme_mel',
    }));
  });
});

const REUSED_PAT_SHAPED = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
inst kick type=noise env=12,down
pat mel_a = C4 E4 G4 C5
pat mel_a2 = D4 F4 A4 D5
pat ba = C2 . G2 .
pat bb = E2 . B1 .
pat da = kick . sn .
pat db = kick sn kick sn
# --- Section 2: Hook ---
seq hook_mel = mel_a mel_a2 mel_a mel_a2
seq hook_bass = ba ba bb bb
seq hook_perc = da da db db
# --- Section 7: Finale ---
seq finale_mel = mel_a mel_a2 mel_a mel_a2
seq finale_bass = ba ba bb bb
seq finale_perc = da da db db
channel 1 => inst lead seq hook_mel finale_mel
channel 2 => inst bass seq hook_bass finale_bass
channel 3 => inst kick seq hook_perc finale_perc
play`;

function reusedPatSongAst() {
  const pats: Record<string, string[]> = {
    mel_a: ['C4', 'E4', 'G4', 'C5'],
    mel_a2: ['D4', 'F4', 'A4', 'D5'],
    ba: ['C2', '.', 'G2', '.'],
    bb: ['E2', '.', 'B1', '.'],
    da: ['kick', '.', 'sn', '.'],
    db: ['kick', 'sn', 'kick', 'sn'],
  };
  const seqs: Record<string, string[]> = {
    hook_mel: ['mel_a', 'mel_a2', 'mel_a', 'mel_a2'],
    hook_bass: ['ba', 'ba', 'bb', 'bb'],
    hook_perc: ['da', 'da', 'db', 'db'],
    finale_mel: ['mel_a', 'mel_a2', 'mel_a', 'mel_a2'],
    finale_bass: ['ba', 'ba', 'bb', 'bb'],
    finale_perc: ['da', 'da', 'db', 'db'],
  };
  const ast = {
    seqs,
    channels: [
      { id: 1, inst: 'lead', seqSpecTokens: ['hook_mel', 'finale_mel'] },
      { id: 2, inst: 'bass', seqSpecTokens: ['hook_bass', 'finale_bass'] },
      { id: 3, inst: 'kick', seqSpecTokens: ['hook_perc', 'finale_perc'] },
    ],
  };
  const song = {
    chip: 'gameboy',
    pats,
    channels: [
      { id: 1, defaultInstrument: 'lead', events: [] },
      { id: 2, defaultInstrument: 'bass', events: [] },
      { id: 3, defaultInstrument: 'kick', events: [] },
    ],
  };
  return { song, ast };
}

describe('cursor-aware arrangement anchors', () => {
  it('resolveArrangementHintAtCursor prefers enclosing seq on reused pat lines', () => {
    const finaleMelLine = REUSED_PAT_SHAPED.split('\n').findIndex((l) => l.includes('seq finale_mel')) + 1;
    const melACol = REUSED_PAT_SHAPED.split('\n')[finaleMelLine - 1].indexOf('mel_a') + 1;
    expect(resolveArrangementHintAtCursor(REUSED_PAT_SHAPED, finaleMelLine, melACol)).toEqual({
      seqName: 'finale_mel',
    });
  });

  it('findArrangementSliceAnchorAtCursor focuses section 7 when cursor is on reused mel_a', () => {
    const { song, ast } = reusedPatSongAst();
    const sections = listArrangementSections(REUSED_PAT_SHAPED, song, ast);
    const finaleMelLine = REUSED_PAT_SHAPED.split('\n').findIndex((l) => l.includes('seq finale_mel')) + 1;
    const melACol = REUSED_PAT_SHAPED.split('\n')[finaleMelLine - 1].indexOf('mel_a') + 1;
    const anchor = findArrangementSliceAnchorAtCursor(
      REUSED_PAT_SHAPED,
      song,
      ast,
      finaleMelLine,
      melACol,
    );
    expect(anchor?.seqName).toBe('finale_mel');
    expect(anchor?.startStep).toBe(sections[1].startStep);
    expect(sections[1].seqName).toBe('finale_mel');
  });

  it('findArrangementSliceAnchorByName still resolves first timeline pat occurrence', () => {
    const { song, ast } = reusedPatSongAst();
    const anchor = findArrangementSliceAnchorByName(REUSED_PAT_SHAPED, song, ast, 'mel_a');
    expect(anchor?.seqName).toBe('hook_mel');
  });

  it('findArrangementSliceAnchorAtCursor resolves channel timeline ref under cursor', () => {
    const { song, ast } = reusedPatSongAst();
    const channelLine = REUSED_PAT_SHAPED.split('\n').findIndex((l) => l.startsWith('channel 1')) + 1;
    const line = REUSED_PAT_SHAPED.split('\n')[channelLine - 1];
    const finaleCol = line.indexOf('finale_mel') + 1;
    const anchor = findArrangementSliceAnchorAtCursor(
      REUSED_PAT_SHAPED,
      song,
      ast,
      channelLine,
      finaleCol,
    );
    expect(anchor?.seqName).toBe('finale_mel');
    expect(anchor?.channelItemIndex).toBe(1);
  });
});

const REPEATED_SEQ_SHAPED = `chip gameboy
bpm 120
inst leadA type=pulse1 duty=50 env=12,down
pat melody_pat = C4 E4 G4 C5
pat melody_alt_pat = D4 F4 A4 D5
pat fill_pat = G4 . G4 .
seq lead_seq = melody_pat melody_alt_pat fill_pat melody_pat
channel 1 => inst leadA seq lead_seq lead_seq
play`;

function repeatedSeqSongAst() {
  const pats: Record<string, string[]> = {
    melody_pat: ['C4', 'E4', 'G4', 'C5'],
    melody_alt_pat: ['D4', 'F4', 'A4', 'D5'],
    fill_pat: ['G4', '.', 'G4', '.'],
  };
  const seqs: Record<string, string[]> = {
    lead_seq: ['melody_pat', 'melody_alt_pat', 'fill_pat', 'melody_pat'],
  };
  const ast = {
    seqs,
    channels: [{ id: 1, inst: 'leadA', seqSpecTokens: ['lead_seq', 'lead_seq'] }],
  };
  const song = {
    chip: 'gameboy',
    pats,
    channels: [{ id: 1, defaultInstrument: 'leadA', events: [] }],
  };
  return { song, ast };
}

describe('repeated top-level channel seq items', () => {
  it('listArrangementSections keeps each seq occurrence as its own section', () => {
    const { song, ast } = repeatedSeqSongAst();
    const sections = listArrangementSections(REPEATED_SEQ_SHAPED, song, ast);
    expect(sections).toHaveLength(2);
    expect(sections[0].seqName).toBe('lead_seq');
    expect(sections[1].seqName).toBe('lead_seq');
    expect(sections[0].channelItemIndex).toBe(0);
    expect(sections[1].channelItemIndex).toBe(1);
    expect(sections[0].startStep).toBe(0);
    expect(sections[0].endStep).toBe(16);
    expect(sections[1].startStep).toBe(16);
    expect(sections[1].endStep).toBe(32);
    expect(sections[0].key).not.toBe(sections[1].key);
  });

  it('resolveSliceWindow bounds each occurrence independently', () => {
    const { song, ast } = repeatedSeqSongAst();
    const timelines = buildChannelTimelines(REPEATED_SEQ_SHAPED, song, ast);
    const sections = listArrangementSections(REPEATED_SEQ_SHAPED, song, ast);
    for (const section of sections) {
      const window = resolveSliceWindow(timelines, {
        channelId: section.channelId,
        startStep: section.startStep,
        endStep: section.endStep,
        seqName: section.seqName,
        patName: section.patName,
        channelItemIndex: section.channelItemIndex,
      });
      expect(window).toEqual({
        startStep: section.startStep,
        endStep: section.endStep,
      });
    }
  });

  it('findArrangementSliceAnchorAtCursor resolves the seq token under the cursor', () => {
    const { song, ast } = repeatedSeqSongAst();
    const channelLine = REPEATED_SEQ_SHAPED.split('\n').findIndex((l) => l.startsWith('channel 1')) + 1;
    const line = REPEATED_SEQ_SHAPED.split('\n')[channelLine - 1];
    const firstCol = line.indexOf('lead_seq') + 1;
    const secondCol = line.indexOf('lead_seq', firstCol) + 1;

    const first = findArrangementSliceAnchorAtCursor(
      REPEATED_SEQ_SHAPED,
      song,
      ast,
      channelLine,
      firstCol,
    );
    const second = findArrangementSliceAnchorAtCursor(
      REPEATED_SEQ_SHAPED,
      song,
      ast,
      channelLine,
      secondCol,
    );

    expect(first?.channelItemIndex).toBe(0);
    expect(first?.startStep).toBe(0);
    expect(first?.endStep).toBe(16);
    expect(second?.channelItemIndex).toBe(1);
    expect(second?.startStep).toBe(16);
    expect(second?.endStep).toBe(32);
  });

  it('findAdjacentSectionAnchor steps between repeated seq occurrences', () => {
    const { song, ast } = repeatedSeqSongAst();
    const sections = listArrangementSections(REPEATED_SEQ_SHAPED, song, ast);
    const firstFocus = resolveSectionFocus(REPEATED_SEQ_SHAPED, song, ast, {
      channelId: sections[0].channelId,
      startStep: sections[0].startStep,
      endStep: sections[0].endStep,
      seqName: sections[0].seqName,
      patName: sections[0].patName,
      channelItemIndex: sections[0].channelItemIndex,
    });
    const next = findAdjacentSectionAnchor(sections, firstFocus!.window, 'next');
    expect(next?.channelItemIndex).toBe(1);
    expect(next?.startStep).toBe(16);
    expect(next?.endStep).toBe(32);
  });
});

const NON_CONTIGUOUS_REPEAT_SHAPED = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat mel_a = C4 E4 G4 C5
pat mel_b = D4 F4 A4 D5
seq chorus_pal = mel_a
seq verse = mel_b
channel 1 => inst lead seq verse chorus_pal verse chorus_pal
play`;

function nonContiguousRepeatSongAst() {
  const pats: Record<string, string[]> = {
    mel_a: ['C4', 'E4', 'G4', 'C5'],
    mel_b: ['D4', 'F4', 'A4', 'D5'],
  };
  const seqs: Record<string, string[]> = {
    chorus_pal: ['mel_a'],
    verse: ['mel_b'],
  };
  const ast = {
    seqs,
    channels: [{
      id: 1,
      inst: 'lead',
      seqSpecTokens: ['verse', 'chorus_pal', 'verse', 'chorus_pal'],
    }],
  };
  const song = {
    chip: 'gameboy',
    pats,
    channels: [{ id: 1, defaultInstrument: 'lead', events: [] }],
  };
  return { song, ast };
}

describe('non-contiguous repeated section names', () => {
  it('listArrangementSections uses unique occurrence keys for separated repeats', () => {
    const { song, ast } = nonContiguousRepeatSongAst();
    const sections = listArrangementSections(NON_CONTIGUOUS_REPEAT_SHAPED, song, ast);
    const chorusSections = sections.filter((section) => section.seqName === 'chorus_pal');
    expect(chorusSections).toHaveLength(2);
    expect(chorusSections[0].key).not.toBe(chorusSections[1].key);
    expect(chorusSections[0].key).toBe(`seq:chorus_pal:1@s${chorusSections[0].startStep}`);
    expect(chorusSections[1].key).toBe(`seq:chorus_pal:3@s${chorusSections[1].startStep}`);
  });
});

const DANCEFLOOR_SHAPED = `chip gameboy
bpm 128
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
inst arp type=wave wave=[0,2,4,6,8,10,12,14,15,14,12,10,8,6,4,2]
inst kick type=noise env=12,down
pat rest = . . . .
pat a = C4 E4 G4 C5
pat b = E4 G4 B4 E5
pat ba = C2 . G2 .
pat bb = E2 . B1 .
pat da = kick . sn .
pat db = kick sn kick sn
# --- Section 1: Intro (Bars 1-4) — drums only ---
seq lead_intro = rest rest rest rest
seq bass_intro = ba ba bb bb
seq arp_intro = rest rest rest a
seq drum_seq_intro = da da db db
# --- Section 2: Build (Bars 5-8) — arpeggio hook enters ---
seq lead_build = rest rest rest rest
seq bass_build = rest rest rest rest
seq arp_build = a b a b
seq drum_seq_build = da db da db
# --- Section 3: Main groove (Bars 9-16) — full band, Am-F-C-G x2 ---
seq lead_main = a b a b a b a b
seq bass_main = ba bb ba bb ba bb ba bb
seq arp_main = a b a b a b a b
seq drum_seq_main = da db da db da db da db
seq orphan_lead = a b
seq orphan_bass = ba bb
channel 1 => inst lead seq lead_intro lead_build lead_main orphan_lead
channel 2 => inst bass seq bass_intro bass_build bass_main orphan_bass
channel 3 => inst arp seq arp_intro arp_build arp_main
channel 4 => inst kick seq drum_seq_intro drum_seq_build drum_seq_main
play`;

function dancefloorSongAst() {
  const pats: Record<string, string[]> = {
    rest: ['.', '.', '.', '.'],
    a: ['C4', 'E4', 'G4', 'C5'],
    b: ['E4', 'G4', 'B4', 'E5'],
    ba: ['C2', '.', 'G2', '.'],
    bb: ['E2', '.', 'B1', '.'],
    da: ['kick', '.', 'sn', '.'],
    db: ['kick', 'sn', 'kick', 'sn'],
  };
  const seqs: Record<string, string[]> = {
    lead_intro: ['rest', 'rest', 'rest', 'rest'],
    bass_intro: ['ba', 'ba', 'bb', 'bb'],
    arp_intro: ['rest', 'rest', 'rest', 'a'],
    drum_seq_intro: ['da', 'da', 'db', 'db'],
    lead_build: ['rest', 'rest', 'rest', 'rest'],
    bass_build: ['rest', 'rest', 'rest', 'rest'],
    arp_build: ['a', 'b', 'a', 'b'],
    drum_seq_build: ['da', 'db', 'da', 'db'],
    lead_main: ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'],
    bass_main: ['ba', 'bb', 'ba', 'bb', 'ba', 'bb', 'ba', 'bb'],
    arp_main: ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b'],
    drum_seq_main: ['da', 'db', 'da', 'db', 'da', 'db', 'da', 'db'],
    orphan_lead: ['a', 'b'],
    orphan_bass: ['ba', 'bb'],
  };
  const ast = {
    seqs,
    channels: [
      { id: 1, inst: 'lead', seqSpecTokens: ['lead_intro', 'lead_build', 'lead_main', 'orphan_lead'] },
      { id: 2, inst: 'bass', seqSpecTokens: ['bass_intro', 'bass_build', 'bass_main', 'orphan_bass'] },
      { id: 3, inst: 'arp', seqSpecTokens: ['arp_intro', 'arp_build', 'arp_main'] },
      { id: 4, inst: 'kick', seqSpecTokens: ['drum_seq_intro', 'drum_seq_build', 'drum_seq_main'] },
    ],
  };
  const song = {
    chip: 'gameboy',
    pats,
    channels: [
      { id: 1, defaultInstrument: 'lead', events: [] },
      { id: 2, defaultInstrument: 'bass', events: [] },
      { id: 3, defaultInstrument: 'arp', events: [] },
      { id: 4, defaultInstrument: 'kick', events: [] },
    ],
  };
  return { song, ast };
}

describe('resolveSectionFocus', () => {
  it('findSectionCommentAbove resolves section header above seq definitions', () => {
    const comment = findSectionCommentAbove(DANCEFLOOR_SHAPED, 15);
    expect(comment).toEqual({
      label: 'Intro (Bars 1-4) — drums only',
      line: 14,
    });
  });

  it('intro column: highlights section comment and all four channel seq lines', () => {
    const { song, ast } = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, song, ast);
    const introSeg = timelines[0].segments.find((s) => s.seqName === 'lead_intro')!;
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, ast, {
      channelId: 1,
      startStep: introSeg.startStep,
      endStep: introSeg.endStep,
      seqName: 'lead_intro',
      patName: introSeg.patName,
    });

    expect(focus).not.toBeNull();
    expect(focus!.sectionLabel).toBe('Intro (Bars 1-4) — drums only');
    expect(focus!.sectionHeadword).toBe('intro');
    expect(focus!.commentLine).toBe(14);
    expect(focus!.seqDefinitionLines).toEqual([15, 16, 17, 18]);
    expect(focus!.channels.map((ch) => ch.seqName)).toEqual([
      'lead_intro',
      'bass_intro',
      'arp_intro',
      'drum_seq_intro',
    ]);
    expect(focus!.primarySeqName).toBe('lead_intro');
    expect(focus!.channelItemIndex).toBe(introSeg.channelItemIndex);
  });

  it('build column: resolves Build section label and seq block', () => {
    const { song, ast } = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, song, ast);
    const buildSeg = timelines[0].segments.find((s) => s.seqName === 'lead_build')!;
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, ast, {
      channelId: 1,
      startStep: buildSeg.startStep,
      endStep: buildSeg.endStep,
      seqName: 'lead_build',
      patName: buildSeg.patName,
    });

    expect(focus).not.toBeNull();
    expect(focus!.sectionLabel).toBe('Build (Bars 5-8) — arpeggio hook enters');
    expect(focus!.sectionHeadword).toBe('build');
    expect(focus!.commentLine).toBe(19);
    expect(focus!.seqDefinitionLines).toEqual([20, 21, 22, 23]);
  });

  it('main groove: parses section title with trailing ---', () => {
    const { song, ast } = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, song, ast);
    const mainSeg = timelines[0].segments.find((s) => s.seqName === 'lead_main')!;
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, ast, {
      channelId: 1,
      startStep: mainSeg.startStep,
      endStep: mainSeg.endStep,
      seqName: 'lead_main',
      patName: mainSeg.patName,
    });

    expect(focus).not.toBeNull();
    expect(focus!.sectionLabel).toBe('Main groove (Bars 9-16) — full band, Am-F-C-G x2');
    expect(focus!.sectionHeadword).toBe('main groove');
    expect(focus!.commentLine).toBe(24);
    expect(focus!.seqDefinitionLines).toEqual([25, 26, 27, 28]);
  });

  it('main groove from bass channel: still resolves section comment above block start', () => {
    const { song, ast } = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, song, ast);
    const bassMain = timelines[1].segments.find((s) => s.seqName === 'bass_main')!;
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, ast, {
      channelId: 2,
      startStep: bassMain.startStep,
      endStep: bassMain.endStep,
      seqName: 'bass_main',
      patName: bassMain.patName,
    });

    expect(focus).not.toBeNull();
    expect(focus!.sectionLabel).toBe('Main groove (Bars 9-16) — full band, Am-F-C-G x2');
    expect(focus!.sectionHeadword).toBe('main groove');
    expect(focus!.commentLine).toBe(24);
    expect(focus!.seqDefinitionLines).toEqual([25, 26, 27, 28]);
  });

  it('main groove expands contiguous seq block when ast channel metadata is missing', () => {
    const { song, ast } = dancefloorSongAst();
    const sections = listArrangementSections(DANCEFLOOR_SHAPED, song, ast);
    const main = sections.find((section) => section.label === 'lead_main')!;
    const strippedAst = { ...ast, seqs: {} };
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, strippedAst, {
      channelId: main.channelId,
      startStep: main.startStep,
      endStep: main.endStep,
      seqName: main.seqName,
      patName: main.patName,
      channelItemIndex: main.channelItemIndex,
    });

    expect(focus).not.toBeNull();
    expect(focus!.seqDefinitionLines).toEqual([25, 26, 27, 28]);
    expect(focus!.channels.map((ch) => ch.seqName)).toEqual([
      'lead_main',
      'bass_main',
      'arp_main',
      'drum_seq_main',
    ]);
  });

  it('seq block without a section comment does not inherit a prior header', () => {
    const { song, ast } = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, song, ast);
    const orphanSeg = timelines[0].segments.find((s) => s.seqName === 'orphan_lead')!;
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, ast, {
      channelId: 1,
      startStep: orphanSeg.startStep,
      endStep: orphanSeg.endStep,
      seqName: 'orphan_lead',
      patName: orphanSeg.patName,
    });

    expect(focus).not.toBeNull();
    expect(focus!.commentLine).toBeUndefined();
    expect(focus!.sectionLabel).toBe('orphan_lead');
    expect(focus!.sectionHeadword).toBeNull();
    expect(focus!.seqDefinitionLines).toEqual([29, 30]);
    expect(findSectionCommentAbove(DANCEFLOOR_SHAPED, 29)).toBeNull();
  });

  it('dancefloor-style trailing --- on section headers', () => {
    const line = '# --- Section 3: Main groove (Bars 9-16) — full band, Am-F-C-G x2 ---';
    const src = `chip gameboy\nbpm 120\n${line}\nseq lead_main = a b\nplay`;
    expect(findSectionCommentAbove(src, 4)).toEqual({
      label: 'Main groove (Bars 9-16) — full band, Am-F-C-G x2',
      line: 3,
    });
  });
});

describe('normalizeSectionHeadword', () => {
  it('extracts headword before parens and em dash', () => {
    expect(normalizeSectionHeadword('Intro (Bars 1-4) — drums only')).toBe('intro');
    expect(normalizeSectionHeadword('Main groove (Bars 9-16) — full band')).toBe('main groove');
  });
});

describe('findArrangementSliceAnchorBySectionIdentity', () => {
  it('finds Intro by headword after seq names change', () => {
    const renamed = DANCEFLOOR_SHAPED
      .replace(/lead_intro/g, 'lead_intro_v2')
      .replace(/bass_intro/g, 'bass_intro_v2')
      .replace(/arp_intro/g, 'arp_intro_v2')
      .replace(/drum_seq_intro/g, 'drum_seq_intro_v2');
    const { song, ast } = dancefloorSongAst();
    ast.seqs.lead_intro_v2 = ast.seqs.lead_intro;
    ast.seqs.bass_intro_v2 = ast.seqs.bass_intro;
    ast.seqs.arp_intro_v2 = ast.seqs.arp_intro;
    ast.seqs.drum_seq_intro_v2 = ast.seqs.drum_seq_intro;
    delete ast.seqs.lead_intro;
    delete ast.seqs.bass_intro;
    delete ast.seqs.arp_intro;
    delete ast.seqs.drum_seq_intro;
    for (const ch of ast.channels) {
      ch.seqSpecTokens = ch.seqSpecTokens.map((token: string) => token.replace('_intro', '_intro_v2'));
    }

    const anchor = findArrangementSliceAnchorBySectionIdentity(renamed, song, ast, {
      headword: 'intro',
      seqName: 'lead_intro',
    });

    expect(anchor).not.toBeNull();
    expect(anchor!.seqName).toBe('lead_intro_v2');
  });

  it('finds section by seq name when section comments are stripped', () => {
    const { song, ast } = dancefloorSongAst();
    const stripped = DANCEFLOOR_SHAPED.replace(/^# --- Section.*$/gm, '');

    const anchor = findArrangementSliceAnchorBySectionIdentity(stripped, song, ast, {
      headword: 'intro',
      seqName: 'lead_intro',
    });

    expect(anchor).not.toBeNull();
    expect(anchor!.seqName).toBe('lead_intro');
  });

  it('returns null when the named section no longer exists', () => {
    const withoutIntro = DANCEFLOOR_SHAPED
      .replace(/# --- Section 1: Intro[^\n]*\n/g, '')
      .replace(/seq lead_intro = rest rest rest rest\n/g, '')
      .replace(/seq bass_intro = ba ba bb bb\n/g, '')
      .replace(/seq arp_intro = rest rest rest a\n/g, '')
      .replace(/seq drum_seq_intro = da da db db\n/g, '')
      .replace(
        'channel 1 => inst lead seq lead_intro lead_build lead_main orphan_lead',
        'channel 1 => inst lead seq lead_build lead_main orphan_lead',
      )
      .replace(
        'channel 2 => inst bass seq bass_intro bass_build bass_main orphan_bass',
        'channel 2 => inst bass seq bass_build bass_main orphan_bass',
      )
      .replace(
        'channel 3 => inst arp seq arp_intro arp_build arp_main',
        'channel 3 => inst arp seq arp_build arp_main',
      )
      .replace(
        'channel 4 => inst kick seq drum_seq_intro drum_seq_build drum_seq_main',
        'channel 4 => inst kick seq drum_seq_build drum_seq_main',
      );
    const { song, ast } = dancefloorSongAst();
    delete ast.seqs.lead_intro;
    delete ast.seqs.bass_intro;
    delete ast.seqs.arp_intro;
    delete ast.seqs.drum_seq_intro;
    ast.channels[0].seqSpecTokens = ['lead_build', 'lead_main', 'orphan_lead'];
    ast.channels[1].seqSpecTokens = ['bass_build', 'bass_main', 'orphan_bass'];
    ast.channels[2].seqSpecTokens = ['arp_build', 'arp_main'];
    ast.channels[3].seqSpecTokens = ['drum_seq_build', 'drum_seq_main'];

    const anchor = findArrangementSliceAnchorBySectionIdentity(withoutIntro, song, ast, {
      headword: 'intro',
      seqName: 'lead_intro',
    });

    expect(anchor).toBeNull();
  });
});

describe('listArrangementSections', () => {
  it('lists collapsed seq sections on the reference channel', () => {
    const { song, ast } = dancefloorSongAst();
    const sections = listArrangementSections(DANCEFLOOR_SHAPED, song, ast);
    expect(sections.map((section) => section.label)).toEqual([
      'lead_intro',
      'lead_build',
      'lead_main',
      'orphan_lead',
    ]);
    expect(sections[1]?.startStep).toBe(sections[0]?.endStep);
  });
});

describe('findAdjacentSectionAnchor', () => {
  it('returns the next section window', () => {
    const { song, ast } = dancefloorSongAst();
    const sections = listArrangementSections(DANCEFLOOR_SHAPED, song, ast);
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, ast, {
      channelId: 1,
      startStep: sections[0].startStep,
      endStep: sections[0].endStep,
      seqName: sections[0].seqName,
      patName: sections[0].patName,
    });
    expect(focus).not.toBeNull();
    const next = findAdjacentSectionAnchor(sections, focus!.window, 'next');
    expect(next?.seqName).toBe('lead_build');
  });

  it('returns null at the last section', () => {
    const { song, ast } = dancefloorSongAst();
    const sections = listArrangementSections(DANCEFLOOR_SHAPED, song, ast);
    const last = sections[sections.length - 1];
    const focus = resolveSectionFocus(DANCEFLOOR_SHAPED, song, ast, {
      channelId: last.channelId,
      startStep: last.startStep,
      endStep: last.endStep,
      seqName: last.seqName,
      patName: last.patName,
    });
    expect(findAdjacentSectionAnchor(sections, focus!.window, 'next')).toBeNull();
  });
});

const SHADOW_PHASED_SHAPED = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bleep type=pulse2 duty=25 env=10,down
inst bass type=triangle env=10,down
inst drum type=noise env=12,down
pat silence = . . . .
pat sq1_i1 = C4 E4 G4 C5
pat sq2_i1 = E4 G4 B4 E5
pat tri_i1 = C3 . G3 .
pat drum_i1 = kick . sn .
pat sq1_m1 = C4 D4 E4 F4
pat sq2_m1 = E4 F4 G4 A4
pat tri_m1 = C2 . G2 .
pat drum_m1 = kick sn kick sn
# Square 1
seq sq1_intro = silence sq1_i1
seq sq1_main = sq1_m1
# Square 2
seq sq2_intro = sq2_i1
seq sq2_main = sq2_m1
# Triangle
seq tri_intro = silence tri_i1
seq tri_main = tri_m1
# Drums
seq drum_intro = silence drum_i1
seq drum_main = drum_m1
channel 1 => inst lead seq sq1_intro sq1_main
channel 2 => inst bleep seq sq2_intro sq2_main
channel 3 => inst bass seq tri_intro tri_main
channel 4 => inst drum seq drum_intro drum_main
play`;

function shadowPhasedSongAst() {
  const pats: Record<string, string[]> = {
    silence: ['.', '.', '.', '.'],
    sq1_i1: ['C4', 'E4', 'G4', 'C5'],
    sq2_i1: ['E4', 'G4', 'B4', 'E5'],
    tri_i1: ['C3', '.', 'G3', '.'],
    drum_i1: ['kick', '.', 'sn', '.'],
    sq1_m1: ['C4', 'D4', 'E4', 'F4'],
    sq2_m1: ['E4', 'F4', 'G4', 'A4'],
    tri_m1: ['C2', '.', 'G2', '.'],
    drum_m1: ['kick', 'sn', 'kick', 'sn'],
  };
  const seqs: Record<string, string[]> = {
    sq1_intro: ['silence', 'sq1_i1'],
    sq1_main: ['sq1_m1'],
    sq2_intro: ['sq2_i1'],
    sq2_main: ['sq2_m1'],
    tri_intro: ['silence', 'tri_i1'],
    tri_main: ['tri_m1'],
    drum_intro: ['silence', 'drum_i1'],
    drum_main: ['drum_m1'],
  };
  const ast = {
    seqs,
    channels: [
      { id: 1, inst: 'lead', seqSpecTokens: ['sq1_intro', 'sq1_main'] },
      { id: 2, inst: 'bleep', seqSpecTokens: ['sq2_intro', 'sq2_main'] },
      { id: 3, inst: 'bass', seqSpecTokens: ['tri_intro', 'tri_main'] },
      { id: 4, inst: 'drum', seqSpecTokens: ['drum_intro', 'drum_main'] },
    ],
  };
  const song = {
    chip: 'gameboy',
    pats,
    channels: [
      { id: 1, defaultInstrument: 'lead', events: [] },
      { id: 2, defaultInstrument: 'bleep', events: [] },
      { id: 3, defaultInstrument: 'bass', events: [] },
      { id: 4, defaultInstrument: 'drum', events: [] },
    ],
  };
  return { song, ast };
}

describe('detectArrangementLayout', () => {
  it('classifies structured dancefloor songs', () => {
    const { ast } = dancefloorSongAst();
    expect(detectArrangementLayout(DANCEFLOOR_SHAPED, ast)).toBe('structured');
  });

  it('classifies channel-grouped phased songs', () => {
    const { ast } = shadowPhasedSongAst();
    expect(detectArrangementLayout(SHADOW_PHASED_SHAPED, ast)).toBe('phased');
  });

  it('classifies monolithic single-seq channels', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4 G4 C5
seq lead_main = a a
channel 1 => inst lead seq lead_main
play`;
    const ast = {
      seqs: { lead_main: ['a', 'a'] },
      channels: [{ id: 1, inst: 'lead', seqSpecTokens: ['lead_main'] }],
    };
    expect(detectArrangementLayout(src, ast)).toBe('monolithic');
  });

  it('keeps monolithic layout when only decorative section headers are present', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4 G4 C5
# --- Section 1: Fanfare ---
seq lead_main = a a
channel 1 => inst lead seq lead_main
play`;
    const ast = {
      seqs: { lead_main: ['a', 'a'] },
      channels: [{ id: 1, inst: 'lead', seqSpecTokens: ['lead_main'] }],
    };
    expect(detectArrangementLayout(src, ast)).toBe('monolithic');
  });

  it('classifies mixed channel seq counts when no section headers', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4 G4 C5
seq part_a = a
seq part_b = a a
channel 1 => inst lead seq part_a part_b part_b
channel 2 => inst lead seq part_a part_b
play`;
    const ast = {
      seqs: { part_a: ['a'], part_b: ['a', 'a'] },
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['part_a', 'part_b', 'part_b'] },
        { id: 2, inst: 'lead', seqSpecTokens: ['part_a', 'part_b'] },
      ],
    };
    expect(detectArrangementLayout(src, ast)).toBe('mixed');
  });
});

describe('collectPhaseSeqNames', () => {
  it('collects cross-channel seq names from channel tokens even without ast.seqs', () => {
    const ast = {
      channels: [
        { id: 1, seqSpecTokens: ['lead_intro', 'lead_main'] },
        { id: 2, seqSpecTokens: ['bass_intro', 'bass_main'] },
        { id: 3, seqSpecTokens: ['arp_intro', 'arp_main'] },
        { id: 4, seqSpecTokens: ['drum_seq_intro', 'drum_seq_main'] },
      ],
    };
    expect(collectPhaseSeqNames(ast, 1)).toEqual([
      'lead_main',
      'bass_main',
      'arp_main',
      'drum_seq_main',
    ]);
  });
});

describe('expandContiguousSeqDefinitionLines', () => {
  it('expands a single seed line to the full section seq block', () => {
    const allowed = ['lead_main', 'bass_main', 'arp_main', 'drum_seq_main'];
    expect(expandContiguousSeqDefinitionLines(DANCEFLOOR_SHAPED, [25], 4, allowed)).toEqual([25, 26, 27, 28]);
  });
});

describe('collectPhaseSeqNamesFromSource', () => {
  it('reads phase seq names from channel lines in source', () => {
    expect(collectPhaseSeqNamesFromSource(DANCEFLOOR_SHAPED, 2)).toEqual([
      'lead_main',
      'bass_main',
      'arp_main',
      'drum_seq_main',
    ]);
  });
});

describe('segmentMatchesSectionFocus', () => {
  it('does not fall back to step overlap when focus has a channel item index', () => {
    const focus = {
      channelItemIndex: 2,
      window: { startStep: 128, endStep: 258 },
    };
    expect(segmentMatchesSectionFocus(
      { channelItemIndex: null, startStep: 256, endStep: 272 },
      focus,
    )).toBe(false);
  });

  it('matches by channel item index when timelines diverge across channels', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=50 env=12,down
pat a = C4
pat b = D4
pat c = E4
pat ba = A2
pat bb = B2
pat bc = C3
seq lead_a = a
seq lead_b = b b
seq lead_c = c
seq bass_a = ba
seq bass_b = bb bb bb
seq bass_c = bc
channel 1 => inst lead seq lead_a lead_b lead_c
channel 2 => inst bass seq bass_a bass_b bass_c
play`;
    const ast = {
      seqs: {
        lead_a: ['a'], lead_b: ['b', 'b'], lead_c: ['c'],
        bass_a: ['ba'], bass_b: ['bb', 'bb', 'bb'], bass_c: ['bc'],
      },
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['lead_a', 'lead_b', 'lead_c'] },
        { id: 2, inst: 'bass', seqSpecTokens: ['bass_a', 'bass_b', 'bass_c'] },
      ],
    };
    const song = {
      chip: 'gameboy',
      pats: { a: ['C4'], b: ['D4'], c: ['E4'], ba: ['A2'], bb: ['B2'], bc: ['C3'] },
      channels: [
        { id: 1, defaultInstrument: 'lead', events: [] },
        { id: 2, defaultInstrument: 'bass', events: [] },
      ],
    };

    const timelines = buildChannelTimelines(src, song, ast);
    const sections = listArrangementSections(src, song, ast);
    const sectionB = sections[1];
    expect(sectionB.label).toBe('lead_b');

    const focus = resolveSectionFocus(src, song, ast, {
      channelId: sectionB.channelId,
      startStep: sectionB.startStep,
      endStep: sectionB.endStep,
      seqName: sectionB.seqName,
      patName: sectionB.patName,
      channelItemIndex: sectionB.channelItemIndex,
    });
    expect(focus?.channelItemIndex).toBe(1);

    const bassRow = timelines.find((row) => row.channelId === 2)!;
    const bassMatches = bassRow.segments.filter((seg) => segmentMatchesSectionFocus(seg, focus!));
    expect(bassMatches.map((seg) => seg.patName)).toEqual(['bb', 'bb', 'bb']);
    expect(bassMatches.some((seg) => seg.patName === 'ba')).toBe(false);
    expect(bassMatches.some((seg) => seg.patName === 'bc')).toBe(false);

    const stepWindowMatches = bassRow.segments.filter((seg) =>
      seg.startStep < focus!.window.endStep && focus!.window.startStep < seg.endStep,
    );
    expect(stepWindowMatches.map((seg) => seg.patName)).not.toEqual(['bb', 'bb', 'bb']);
  });

  it('dancefloor main groove: excludes breakdown pats when lead timeline is longer', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=50 env=12,down
inst arp type=wave wave=[0,1,2,3]
inst kick type=noise env=12,down
pat rest = . . . . . . . . . . . . . . . .
pat lead_a = . . . . E5:4 G5:2 A5:2 . . . .
pat lead_b = . . . . C5:2 D5:2 E5:4 . . . .
pat lead_turn = . . E5:2 G5:2 E5:2 D5:2 C5:4 . .
pat lead_peak = . . C6:2 A5:2 G5:2 E5:2 D5:2 C5:2 A4:4
pat ba = A2:2 A2:2 A3:2 A2:2 A2:2 A2:2 A3:2 A2:2
pat bb = F2:2 F2:2 F3:2 F2:2 F2:2 F2:2 F3:2 F2:2
pat arp_a = (A3 C4 E4 A4) * 4
pat arp_b = (F3 A3 C4 F4) * 4
pat da = kick . sn . .
pat db = kick sn kick sn
seq lead_intro = rest rest rest rest
seq bass_intro = rest rest rest rest
seq arp_intro = rest rest rest rest
seq drum_seq_intro = da da da da
seq lead_build = rest rest rest rest
seq bass_build = rest rest rest rest
seq arp_build = arp_a arp_b arp_a arp_b
seq drum_seq_build = da db da db
seq lead_main = lead_a lead_b lead_a lead_turn lead_a lead_b lead_a lead_peak
seq bass_main = ba bb ba bb ba bb ba bb
seq arp_main = arp_a arp_b arp_a arp_b arp_a arp_b arp_a arp_b
seq drum_seq_main = da db da db da db da db
seq lead_break = rest rest rest rest
seq bass_break = ba bb ba bb
seq arp_break = arp_a arp_b arp_a arp_b
seq drum_seq_break = da da da da
channel 1 => inst lead seq lead_intro lead_build lead_main lead_break
channel 2 => inst bass seq bass_intro bass_build bass_main bass_break
channel 3 => inst arp seq arp_intro arp_build arp_main arp_break
channel 4 => inst kick seq drum_seq_intro drum_seq_build drum_seq_main drum_seq_break
play`;
    const pats: Record<string, string[]> = {
      rest: ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.'],
      lead_a: ['.', '.', '.', '.', 'E5:4', 'G5:2', 'A5:2', '.', '.', '.', '.'],
      lead_b: ['.', '.', '.', '.', 'C5:2', 'D5:2', 'E5:4', '.', '.', '.', '.'],
      lead_turn: ['.', '.', 'E5:2', 'G5:2', 'E5:2', 'D5:2', 'C5:4', '.', '.'],
      lead_peak: ['.', '.', 'C6:2', 'A5:2', 'G5:2', 'E5:2', 'D5:2', 'C5:2', 'A4:4'],
      ba: ['A2:2', 'A2:2', 'A3:2', 'A2:2', 'A2:2', 'A2:2', 'A3:2', 'A2:2'],
      bb: ['F2:2', 'F2:2', 'F3:2', 'F2:2', 'F2:2', 'F2:2', 'F3:2', 'F2:2'],
      arp_a: ['(A3 C4 E4 A4) * 4'],
      arp_b: ['(F3 A3 C4 F4) * 4'],
      da: ['kick', '.', 'sn', '.'],
      db: ['kick', 'sn', 'kick', 'sn'],
    };
    const ast = {
      seqs: {
        lead_intro: ['rest', 'rest', 'rest', 'rest'],
        bass_intro: ['rest', 'rest', 'rest', 'rest'],
        arp_intro: ['rest', 'rest', 'rest', 'rest'],
        drum_seq_intro: ['da', 'da', 'da', 'da'],
        lead_build: ['rest', 'rest', 'rest', 'rest'],
        bass_build: ['rest', 'rest', 'rest', 'rest'],
        arp_build: ['arp_a', 'arp_b', 'arp_a', 'arp_b'],
        drum_seq_build: ['da', 'db', 'da', 'db'],
        lead_main: ['lead_a', 'lead_b', 'lead_a', 'lead_turn', 'lead_a', 'lead_b', 'lead_a', 'lead_peak'],
        bass_main: ['ba', 'bb', 'ba', 'bb', 'ba', 'bb', 'ba', 'bb'],
        arp_main: ['arp_a', 'arp_b', 'arp_a', 'arp_b', 'arp_a', 'arp_b', 'arp_a', 'arp_b'],
        drum_seq_main: ['da', 'db', 'da', 'db', 'da', 'db', 'da', 'db'],
        lead_break: ['rest', 'rest', 'rest', 'rest'],
        bass_break: ['ba', 'bb', 'ba', 'bb'],
        arp_break: ['arp_a', 'arp_b', 'arp_a', 'arp_b'],
        drum_seq_break: ['da', 'da', 'da', 'da'],
      },
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['lead_intro', 'lead_build', 'lead_main', 'lead_break'] },
        { id: 2, inst: 'bass', seqSpecTokens: ['bass_intro', 'bass_build', 'bass_main', 'bass_break'] },
        { id: 3, inst: 'arp', seqSpecTokens: ['arp_intro', 'arp_build', 'arp_main', 'arp_break'] },
        { id: 4, inst: 'kick', seqSpecTokens: ['drum_seq_intro', 'drum_seq_build', 'drum_seq_main', 'drum_seq_break'] },
      ],
    };
    const song = {
      chip: 'gameboy',
      pats,
      channels: [
        { id: 1, defaultInstrument: 'lead', events: [] },
        { id: 2, defaultInstrument: 'bass', events: [] },
        { id: 3, defaultInstrument: 'arp', events: [] },
        { id: 4, defaultInstrument: 'kick', events: [] },
      ],
    };

    const timelines = buildChannelTimelines(src, song, ast);
    const leadTotal = timelines.find((row) => row.channelId === 1)!.segments.at(-1)!.endStep;
    const bassTotal = timelines.find((row) => row.channelId === 2)!.segments.at(-1)!.endStep;
    expect(leadTotal).toBeGreaterThan(bassTotal);

    const sections = listArrangementSections(src, song, ast);
    const main = sections.find((section) => section.label === 'lead_main')!;
    const focus = resolveSectionFocus(src, song, ast, {
      channelId: main.channelId,
      startStep: main.startStep,
      endStep: main.endStep,
      seqName: main.seqName,
      patName: main.patName,
      channelItemIndex: main.channelItemIndex,
    });

    expect(focus?.channelItemIndex).toBe(2);
    expect(focus?.seqDefinitionLines.length).toBe(4);

    for (const row of timelines) {
      const matched = row.segments.filter((seg) => segmentMatchesSectionFocus(seg, focus!));
      expect(matched.every((seg) => seg.channelItemIndex === 2)).toBe(true);
      expect(matched.some((seg) => seg.seqName?.includes('_break'))).toBe(false);
    }
  });
});

describe('phased section focus (shadow_temple-shaped)', () => {
  it('intro focus highlights all four channel seq definition lines', () => {
    const { song, ast } = shadowPhasedSongAst();
    const sections = listArrangementSections(SHADOW_PHASED_SHAPED, song, ast);
    const intro = sections[0];
    const focus = resolveSectionFocus(SHADOW_PHASED_SHAPED, song, ast, {
      channelId: intro.channelId,
      startStep: intro.startStep,
      endStep: intro.endStep,
      seqName: intro.seqName,
      patName: intro.patName,
      channelItemIndex: intro.channelItemIndex,
    });

    expect(focus).not.toBeNull();
    expect(focus!.seqDefinitionLines).toEqual([17, 20, 23, 26]);
    expect(focus!.channels.map((ch) => ch.seqName)).toEqual([
      'sq1_intro',
      'sq2_intro',
      'tri_intro',
      'drum_intro',
    ]);
  });
});

describe('arrangement layout diagnostics', () => {
  it('emits phased info on the first channel line', () => {
    const { ast } = shadowPhasedSongAst();
    const diags = getArrangementLayoutDiagnostics(SHADOW_PHASED_SHAPED, ast);
    expect(diags).toHaveLength(1);
    expect(diags[0].level).toBe('info');
    expect(diags[0].loc?.start?.line).toBe(findFirstChannelLine(SHADOW_PHASED_SHAPED));
    expect(diags[0].message).toMatch(/Phased layout detected/);
  });

  it('emits no diagnostics for structured songs', () => {
    const { ast } = dancefloorSongAst();
    expect(getArrangementLayoutDiagnostics(DANCEFLOOR_SHAPED, ast)).toEqual([]);
  });
});

describe('restructurePhasedSections', () => {
  it('rewrites channel-grouped phased seqs into section headers', () => {
    const { ast } = shadowPhasedSongAst();
    const result = restructurePhasedSections(SHADOW_PHASED_SHAPED, ast);
    expect(result).not.toBeNull();
    expect(result!.sectionCount).toBe(2);
    expect(result!.source).toMatch(/# --- Section 1: Intro ---/);
    expect(result!.source).toMatch(/# --- Section 2: Main ---/);
    expect(result!.source.indexOf('sq1_intro')).toBeLessThan(result!.source.indexOf('sq2_intro'));
    expect(result!.source.indexOf('sq2_intro')).toBeLessThan(result!.source.indexOf('tri_intro'));
    expect(result!.source).toMatch(/channel 1 => inst lead seq sq1_intro sq1_main/);
    expect(detectArrangementLayout(result!.source, ast)).toBe('structured');
  });

  it('relocates per-channel comment blocks with their first phase seq', () => {
    const { ast } = shadowPhasedSongAst();
    const result = restructurePhasedSections(SHADOW_PHASED_SHAPED, ast);
    expect(result).not.toBeNull();
    expect(result!.source).toMatch(/# Square 1/);
    expect(result!.source).toMatch(/# --- Section 1: Intro ---[\s\S]*# Square 2[\s\S]*seq sq2_intro/);
    expect(result!.source).toMatch(/# --- Section 1: Intro ---[\s\S]*# Triangle[\s\S]*seq tri_intro/);
    expect(result!.source).toMatch(/# --- Section 1: Intro ---[\s\S]*# Drums[\s\S]*seq drum_intro/);
  });

  it('preserves unreferenced helper sequences after section blocks', () => {
    const src = SHADOW_PHASED_SHAPED.replace(
      'seq sq1_main = sq1_m1',
      '# Preview helper for sq1 intro patterns\nseq sq1_preview = sq1_i1\nseq sq1_main = sq1_m1',
    );
    const { ast } = shadowPhasedSongAst();
    const result = restructurePhasedSections(src, ast);
    expect(result).not.toBeNull();
    expect(result!.source).toMatch(/# --- Additional sequences ---/);
    expect(result!.source).toMatch(/# Preview helper for sq1 intro patterns/);
    expect(result!.source).toMatch(/seq sq1_preview = sq1_i1/);
    expect(result!.source.indexOf('# --- Section 2: Main ---'))
      .toBeLessThan(result!.source.indexOf('# --- Additional sequences ---'));
  });

  it('returns null for structured songs', () => {
    const { ast } = dancefloorSongAst();
    expect(restructurePhasedSections(DANCEFLOOR_SHAPED, ast)).toBeNull();
    expect(explainPhasedRestructureUnavailable(DANCEFLOOR_SHAPED, ast)).toMatch(/already has/i);
  });

  it('detects phased layout from source even when a stale ast says monolithic', () => {
    const { ast: phasedAst } = shadowPhasedSongAst();
    const monolithicAst = {
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['sq1_main'] },
        { id: 2, inst: 'bleep', seqSpecTokens: ['sq2_main'] },
      ],
      seqs: phasedAst.seqs,
    };
    expect(restructurePhasedSections(SHADOW_PHASED_SHAPED, monolithicAst)).toBeNull();
    expect(explainPhasedRestructureUnavailable(SHADOW_PHASED_SHAPED, monolithicAst))
      .toMatch(/one long seq per channel/i);
    expect(restructurePhasedSections(SHADOW_PHASED_SHAPED, phasedAst)).not.toBeNull();
  });
});
