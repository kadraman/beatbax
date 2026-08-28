/**
 * Arrangement-slice builder unit tests.
 */

import {
  buildArrangementSliceSource,
  findArrangementSliceAnchorByName,
  findArrangementSliceAnchorAtCursor,
  resolveArrangementHintAtCursor,
  findAdjacentSectionAnchor,
  listArrangementSections,
  buildChannelTimelines,
  findSectionCommentAbove,
  resolveSectionFocus,
} from '../src/editor/arrangement-slice';

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
    expect(focus!.sectionLabel).toBe('Section');
    expect(focus!.commentLine).toBe(14);
    expect(focus!.seqDefinitionLines).toEqual([15, 16, 17, 18]);
    expect(focus!.channels.map((ch) => ch.seqName)).toEqual([
      'lead_intro',
      'bass_intro',
      'arp_intro',
      'drum_seq_intro',
    ]);
    expect(focus!.primarySeqName).toBe('lead_intro');
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
    expect(focus!.sectionLabel).toBe('Section');
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
    expect(focus!.sectionLabel).toBe('Section');
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
    expect(focus!.sectionLabel).toBe('Section');
    expect(focus!.commentLine).toBe(24);
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
    expect(focus!.sectionLabel).toBe('Section');
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
