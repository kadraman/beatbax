/// <reference path="./test-types.d.ts" />

import { buildChannelTimelines } from '@beatbax/app-core/editor/arrangement-slice';
import { createSectionFocusController } from '../src/renderer/src/lib/section-focus-controller';

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

describe('createSectionFocusController', () => {
  it('exit() clears focus so refresh() does not re-apply stale anchors after song switch', () => {
    const heroes = heroesSongAst();
    const timelines = buildChannelTimelines(HEROES_SHAPED, heroes.song, heroes.ast);
    const themeSeg = timelines[0].segments.find((s) => s.seqName === 'theme_mel')!;

    let songContext: { song: unknown; ast?: unknown } | null = heroes;
    const setSectionFocus = jest.fn();
    const setSliceHighlight = jest.fn();
    const applyFocus = jest.fn();
    const clearFocus = jest.fn();

    const controller = createSectionFocusController({
      getSource: () => HEROES_SHAPED,
      getSongContext: () => songContext,
      getPatternGrid: () => ({ setSectionFocus, setSliceHighlight } as never),
      sectionFocusEditor: {
        applyFocus,
        revealFocus: jest.fn(),
        clearFocus,
        dispose: jest.fn(),
      },
      playbackManager: { stop: jest.fn() } as never,
      eventBus: { emit: jest.fn() } as never,
    });

    controller.enter({
      channelId: 1,
      startStep: themeSeg.startStep,
      endStep: themeSeg.endStep,
      seqName: 'theme_mel',
      patName: themeSeg.patName,
    }, { play: false });

    expect(controller.isActive()).toBe(true);
    expect(controller.getFocusInfo()).not.toBeNull();

    controller.exit();

    expect(controller.isActive()).toBe(false);
    expect(controller.getFocusInfo()).toBeNull();
    expect(clearFocus).toHaveBeenCalled();
    expect(setSectionFocus).toHaveBeenCalledWith(null);

    setSectionFocus.mockClear();
    setSliceHighlight.mockClear();
    applyFocus.mockClear();

    songContext = {
      song: { chip: 'gameboy', pats: {}, channels: [] },
      ast: { seqs: {}, channels: [] },
    };
    controller.refresh();

    expect(controller.isActive()).toBe(false);
    expect(controller.getFocusInfo()).toBeNull();
    expect(setSectionFocus).not.toHaveBeenCalled();
    expect(setSliceHighlight).not.toHaveBeenCalled();
    expect(applyFocus).not.toHaveBeenCalled();
  });
});
