/**
 * Pattern Grid section focus for spec 008 `section` / `form` songs.
 * Uses a synthetic AST (engine parser is mocked in app-core Jest).
 */

import {
  findArrangementSliceAnchorBySectionIdentity,
  findSectionCommentAbove,
  findSectionDeclarationLines,
  listArrangementSections,
  resolveSectionFocus,
  sectionNameFromGeneratedSeq,
} from '../src/editor/arrangement-slice';

const COMPOSITION_SRC = `chip gameboy
bpm 120
inst lead type=pulse1
inst arp type=pulse2
inst bass type=pulse1
inst kick type=noise
pat a = C4 E4
pat b = D4 F4
pat c = E4 G4
pat d = F4 A4
pat e = G4 B4
pat f = A4 C5
pat g = C4 .
pat h = . C4

# --- Section 1: Intro Fanfare ---

section intro {
  mel = a
  harm = c
  bass = e
  perc = g
}

# --- Section 2: Theme A — main hook ---

section theme {
  mel = b
  harm = d
  bass = f
  perc = h
}

form main = intro, theme
channel 1 => inst lead role mel form main
channel 2 => inst arp role harm form main
channel 3 => inst bass role bass form main
channel 4 => inst kick role perc form main
play
`;

function compositionAst() {
  const pats: Record<string, string[]> = {
    a: ['C4', 'E4'],
    b: ['D4', 'F4'],
    c: ['E4', 'G4'],
    d: ['F4', 'A4'],
    e: ['G4', 'B4'],
    f: ['A4', 'C5'],
    g: ['C4', '.'],
    h: ['.', 'C4'],
  };
  return {
    pats,
    seqs: {
      intro_mel: ['a'],
      intro_harm: ['c'],
      intro_bass: ['e'],
      intro_perc: ['g'],
      theme_mel: ['b'],
      theme_harm: ['d'],
      theme_bass: ['f'],
      theme_perc: ['h'],
    },
    sections: {
      intro: { roles: [{ role: 'mel', items: [{ name: 'a' }] }] },
      theme: { roles: [{ role: 'mel', items: [{ name: 'b' }] }] },
    },
    forms: { main: { sectionNames: ['intro', 'theme'] } },
    channels: [
      { id: 1, inst: 'lead', pat: 'intro_mel theme_mel', seqSpecTokens: ['intro_mel', 'theme_mel'] },
      { id: 2, inst: 'arp', pat: 'intro_harm theme_harm', seqSpecTokens: ['intro_harm', 'theme_harm'] },
      { id: 3, inst: 'bass', pat: 'intro_bass theme_bass', seqSpecTokens: ['intro_bass', 'theme_bass'] },
      { id: 4, inst: 'kick', pat: 'intro_perc theme_perc', seqSpecTokens: ['intro_perc', 'theme_perc'] },
    ],
  };
}

function compositionSong(ast: ReturnType<typeof compositionAst>) {
  const mkEvents = (n: number) => Array.from({ length: n }, (_, i) => ({ step: i }));
  return {
    pats: ast.pats,
    channels: ast.channels.map((ch) => ({
      id: ch.id,
      defaultInstrument: ch.inst,
      // 2 pats × 2 steps for intro + theme
      events: mkEvents(4),
    })),
  };
}

describe('section composition focus (spec 008)', () => {
  const ast = compositionAst();
  const song = compositionSong(ast);

  it('maps generated seq names to authored sections', () => {
    expect(sectionNameFromGeneratedSeq('intro_mel', ast)).toBe('intro');
    expect(sectionNameFromGeneratedSeq('theme_perc', ast)).toBe('theme');
  });

  it('finds section declaration line ranges', () => {
    const intro = findSectionDeclarationLines(COMPOSITION_SRC, 'intro');
    expect(intro.length).toBeGreaterThanOrEqual(2);
    expect(COMPOSITION_SRC.split('\n')[intro[0] - 1]).toMatch(/^\s*section\s+intro\b/);
    expect(COMPOSITION_SRC.split('\n')[intro[intro.length - 1] - 1]).toMatch(/\}/);
  });

  it('attaches section comments above section decls', () => {
    const introLines = findSectionDeclarationLines(COMPOSITION_SRC, 'intro');
    const comment = findSectionCommentAbove(COMPOSITION_SRC, Math.min(...introLines));
    expect(comment?.label).toMatch(/Intro Fanfare/i);
  });

  it('lists sections with authored section names (not comments)', () => {
    const blocks = listArrangementSections(COMPOSITION_SRC, song, ast);
    expect(blocks.map((b) => b.label)).toEqual(['intro', 'theme']);
  });

  it('resolveSectionFocus navigates to the section block', () => {
    const blocks = listArrangementSections(COMPOSITION_SRC, song, ast);
    expect(blocks.length).toBe(2);
    const focus = resolveSectionFocus(COMPOSITION_SRC, song, ast, {
      channelId: blocks[0].channelId,
      startStep: blocks[0].startStep,
      endStep: blocks[0].endStep,
      seqName: blocks[0].seqName,
      patName: blocks[0].patName,
      channelItemIndex: blocks[0].channelItemIndex,
    });
    expect(focus).not.toBeNull();
    expect(focus!.sectionLabel).toMatch(/Intro Fanfare/i);
    expect(focus!.commentLine).toBeTruthy();
    expect(focus!.seqDefinitionLines.length).toBeGreaterThan(0);
    expect(COMPOSITION_SRC.split('\n')[focus!.seqDefinitionLines[0] - 1]).toMatch(/^\s*section\s+intro\b/);
  });

  it('rebinds focus by comment headword without seq definition lines', () => {
    const anchor = findArrangementSliceAnchorBySectionIdentity(COMPOSITION_SRC, song, ast, {
      headword: 'intro fanfare',
      seqName: 'intro_mel_renamed',
    });
    expect(anchor).not.toBeNull();
    expect(anchor!.seqName).toBe('intro_mel');
  });

  it('navigates using source section decls when ast is a SongModel (no sections)', () => {
    // Playback parse:success historically stores SongModel as `ast`.
    const roles = ['mel', 'harm', 'bass', 'perc'] as const;
    const introPats = ['a', 'c', 'e', 'g'] as const;
    const themePats = ['b', 'd', 'f', 'h'] as const;
    const songWithSeqMeta = {
      ...song,
      channels: song.channels.map((ch: any, idx: number) => {
        const role = roles[idx];
        return {
          ...ch,
          events: [
            { step: 0, sourcePattern: introPats[idx], sourceSequence: `intro_${role}` },
            { step: 1, sourcePattern: introPats[idx], sourceSequence: `intro_${role}` },
            { step: 2, sourcePattern: themePats[idx], sourceSequence: `theme_${role}` },
            { step: 3, sourcePattern: themePats[idx], sourceSequence: `theme_${role}` },
          ],
        };
      }),
    };
    // No `sections` / seqSpecTokens — same shape as resolveSong() output used as ast.
    const songAsAst = { pats: ast.pats, seqs: ast.seqs, channels: songWithSeqMeta.channels };
    const blocks = listArrangementSections(COMPOSITION_SRC, songWithSeqMeta, songAsAst);
    expect(blocks.length).toBe(2);
    const focus = resolveSectionFocus(COMPOSITION_SRC, songWithSeqMeta, songAsAst, {
      channelId: blocks[0].channelId,
      startStep: blocks[0].startStep,
      endStep: blocks[0].endStep,
      seqName: blocks[0].seqName,
      patName: blocks[0].patName,
      channelItemIndex: blocks[0].channelItemIndex,
    });
    expect(focus).not.toBeNull();
    expect(focus!.sectionLabel).toMatch(/Intro Fanfare/i);
    expect(focus!.seqDefinitionLines.length).toBeGreaterThan(0);
    expect(COMPOSITION_SRC.split('\n')[focus!.seqDefinitionLines[0] - 1]).toMatch(/^\s*section\s+intro\b/);
  });
});
