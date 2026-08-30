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
channel 1 => inst lead seq lead_intro lead_build lead_main
channel 2 => inst bass seq bass_intro bass_build bass_main
channel 3 => inst arp seq arp_intro arp_build arp_main
channel 4 => inst kick seq drum_seq_intro drum_seq_build drum_seq_main
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
  };
  const ast = {
    seqs,
    channels: [
      { id: 1, inst: 'lead', seqSpecTokens: ['lead_intro', 'lead_build', 'lead_main'] },
      { id: 2, inst: 'bass', seqSpecTokens: ['bass_intro', 'bass_build', 'bass_main'] },
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

function createMockController(overrides: Partial<Parameters<typeof createSectionFocusController>[0]> = {}) {
  const setSectionFocus = jest.fn();
  const setSliceHighlight = jest.fn();
  const setSlicePlaybackRemap = jest.fn();
  const applyFocus = jest.fn();
  const clearFocus = jest.fn();
  const play = jest.fn().mockResolvedValue(undefined);
  const stop = jest.fn();
  const isPlaying = jest.fn().mockReturnValue(false);
  const getLoop = jest.fn().mockReturnValue(false);
  const onStatus = jest.fn();
  const onFocusChange = jest.fn();
  const emit = jest.fn();
  const eventHandlers: Record<string, Array<() => void>> = {};

  const controller = createSectionFocusController({
    getSource: () => HEROES_SHAPED,
    getSongContext: () => heroesSongAst(),
    getPatternGrid: () => ({ setSectionFocus, setSliceHighlight, setSlicePlaybackRemap } as never),
    sectionFocusEditor: {
      applyFocus,
      revealFocus: jest.fn(),
      clearFocus,
      dispose: jest.fn(),
    },
    playbackManager: { play, stop, isPlaying, getLoop } as never,
    eventBus: {
      emit,
      on: (event: string, handler: () => void) => {
        eventHandlers[event] = eventHandlers[event] ?? [];
        eventHandlers[event].push(handler);
        return () => {
          eventHandlers[event] = eventHandlers[event].filter((fn) => fn !== handler);
        };
      },
    } as never,
    onStatus,
    onFocusChange,
    ...overrides,
  });

  return {
    controller,
    setSectionFocus,
    setSliceHighlight,
    setSlicePlaybackRemap,
    applyFocus,
    clearFocus,
    play,
    stop,
    isPlaying,
    onStatus,
    onFocusChange,
    emitPlaybackStopped: () => {
      for (const handler of eventHandlers['playback:stopped'] ?? []) handler();
    },
  };
}

describe('createSectionFocusController', () => {
  it('exit() clears focus so refresh() does not re-apply stale anchors after song switch', () => {
    const heroes = heroesSongAst();
    const timelines = buildChannelTimelines(HEROES_SHAPED, heroes.song, heroes.ast);
    const themeSeg = timelines[0].segments.find((s) => s.seqName === 'theme_mel')!;

    let songContext: { song: unknown; ast?: unknown } | null = heroes;
    const { controller, setSectionFocus, setSliceHighlight, applyFocus, clearFocus } = createMockController({
      getSongContext: () => songContext,
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

  it('refresh() rebinds Intro by headword after the section grows', () => {
    const dancefloor = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, dancefloor.song, dancefloor.ast);
    const introSeg = timelines[0].segments.find((s) => s.seqName === 'lead_intro')!;

    let source = DANCEFLOOR_SHAPED;
    let songContext: { song: unknown; ast?: unknown } | null = dancefloor;

    const { controller, play, isPlaying } = createMockController({
      getSource: () => source,
      getSongContext: () => songContext,
    });

    controller.enter({
      channelId: 1,
      startStep: introSeg.startStep,
      endStep: introSeg.endStep,
      seqName: 'lead_intro',
      patName: introSeg.patName,
      channelItemIndex: introSeg.channelItemIndex,
    }, { play: false });

    const originalWindow = controller.getFocusInfo()!.window;

    source = DANCEFLOOR_SHAPED.replace(
      'seq lead_intro = rest rest rest rest',
      'seq lead_intro = rest rest rest rest rest rest rest rest',
    );
    dancefloor.ast.seqs.lead_intro = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'];
    songContext = dancefloor;

    controller.refresh();

    expect(controller.isActive()).toBe(true);
    const rebound = controller.getFocusInfo()!.window;
    expect(rebound.endStep - rebound.startStep).toBeGreaterThan(originalWindow.endStep - originalWindow.startStep);
    expect(play).not.toHaveBeenCalled();

    isPlaying.mockReturnValue(true);
    controller.refresh();
    expect(play).toHaveBeenCalled();
  });

  it('refresh() exits when the named section is removed', () => {
    const dancefloor = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, dancefloor.song, dancefloor.ast);
    const introSeg = timelines[0].segments.find((s) => s.seqName === 'lead_intro')!;

    let source = DANCEFLOOR_SHAPED;
    const { controller, onStatus, clearFocus } = createMockController({
      getSource: () => source,
      getSongContext: () => dancefloor,
    });

    controller.enter({
      channelId: 1,
      startStep: introSeg.startStep,
      endStep: introSeg.endStep,
      seqName: 'lead_intro',
      patName: introSeg.patName,
      channelItemIndex: introSeg.channelItemIndex,
    }, { play: false });

    source = DANCEFLOOR_SHAPED
      .replace(/# --- Section 1: Intro[^\n]*\n/g, '')
      .replace(/seq lead_intro = rest rest rest rest\n/g, '')
      .replace(/seq bass_intro = ba ba bb bb\n/g, '')
      .replace(/seq arp_intro = rest rest rest a\n/g, '')
      .replace(/seq drum_seq_intro = da da db db\n/g, '')
      .replace(
        'channel 1 => inst lead seq lead_intro lead_build lead_main',
        'channel 1 => inst lead seq lead_build lead_main',
      )
      .replace(
        'channel 2 => inst bass seq bass_intro bass_build bass_main',
        'channel 2 => inst bass seq bass_build bass_main',
      )
      .replace(
        'channel 3 => inst arp seq arp_intro arp_build arp_main',
        'channel 3 => inst arp seq arp_build arp_main',
      )
      .replace(
        'channel 4 => inst kick seq drum_seq_intro drum_seq_build drum_seq_main',
        'channel 4 => inst kick seq drum_seq_build drum_seq_main',
      );
    delete dancefloor.ast.seqs.lead_intro;
    delete dancefloor.ast.seqs.bass_intro;
    delete dancefloor.ast.seqs.arp_intro;
    delete dancefloor.ast.seqs.drum_seq_intro;
    dancefloor.ast.channels[0].seqSpecTokens = ['lead_build', 'lead_main'];
    dancefloor.ast.channels[1].seqSpecTokens = ['bass_build', 'bass_main'];
    dancefloor.ast.channels[2].seqSpecTokens = ['arp_build', 'arp_main'];
    dancefloor.ast.channels[3].seqSpecTokens = ['drum_seq_build', 'drum_seq_main'];

    controller.refresh();

    expect(controller.isActive()).toBe(false);
    expect(clearFocus).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('intro'));
  });

  it('playFocused() returns false and exits when slice cannot be built', () => {
    const heroes = heroesSongAst();
    const timelines = buildChannelTimelines(HEROES_SHAPED, heroes.song, heroes.ast);
    const themeSeg = timelines[0].segments.find((s) => s.seqName === 'theme_mel')!;

    const { controller, clearFocus } = createMockController();

    controller.enter({
      channelId: 1,
      startStep: themeSeg.startStep,
      endStep: themeSeg.endStep,
      seqName: 'theme_mel',
      patName: themeSeg.patName,
    }, { play: false });

    jest.spyOn(require('@beatbax/app-core/editor/arrangement-slice'), 'buildArrangementSliceSource')
      .mockReturnValueOnce(null);

    const played = controller.playFocused();

    expect(played).toBe(false);
    expect(controller.isActive()).toBe(false);
    expect(clearFocus).toHaveBeenCalled();
  });

  it('clears slice playback remap on playback:stopped', () => {
    const heroes = heroesSongAst();
    const timelines = buildChannelTimelines(HEROES_SHAPED, heroes.song, heroes.ast);
    const themeSeg = timelines[0].segments.find((s) => s.seqName === 'theme_mel')!;

    const { controller, setSlicePlaybackRemap, emitPlaybackStopped } = createMockController();

    controller.enter({
      channelId: 1,
      startStep: themeSeg.startStep,
      endStep: themeSeg.endStep,
      seqName: 'theme_mel',
      patName: themeSeg.patName,
    }, { play: false });

    controller.playFocused();
    expect(setSlicePlaybackRemap).toHaveBeenCalledWith(true);

    setSlicePlaybackRemap.mockClear();
    emitPlaybackStopped();
    expect(setSlicePlaybackRemap).toHaveBeenCalledWith(false);
    expect(controller.isSlicePlaybackActive()).toBe(false);
  });

  it('switching focused section while slice is playing starts the new section', () => {
    const dancefloor = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, dancefloor.song, dancefloor.ast);
    const introSeg = timelines[0].segments.find((s) => s.seqName === 'lead_intro')!;
    const mainSeg = timelines[0].segments.find((s) => s.seqName === 'lead_main')!;

    let playing = false;
    const { controller, play, stop, isPlaying } = createMockController({
      getSource: () => DANCEFLOOR_SHAPED,
      getSongContext: () => dancefloor,
    });
    isPlaying.mockImplementation(() => playing);
    play.mockImplementation(async () => {
      playing = true;
    });
    stop.mockImplementation(() => {
      playing = false;
    });

    controller.enter({
      channelId: 1,
      startStep: introSeg.startStep,
      endStep: introSeg.endStep,
      seqName: 'lead_intro',
      patName: introSeg.patName,
      channelItemIndex: introSeg.channelItemIndex,
    }, { play: false });

    controller.playFocused();
    expect(play).toHaveBeenCalledTimes(1);

    play.mockClear();
    stop.mockClear();
    controller.enter({
      channelId: 1,
      startStep: mainSeg.startStep,
      endStep: mainSeg.endStep,
      seqName: 'lead_main',
      patName: mainSeg.patName,
      channelItemIndex: mainSeg.channelItemIndex,
    }, { play: false });

    expect(stop).toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
    expect(String(play.mock.calls[0]?.[0] ?? '')).toContain('lead_main');
  });

  it('switching focused section while stopped does not auto-play', () => {
    const dancefloor = dancefloorSongAst();
    const timelines = buildChannelTimelines(DANCEFLOOR_SHAPED, dancefloor.song, dancefloor.ast);
    const introSeg = timelines[0].segments.find((s) => s.seqName === 'lead_intro')!;
    const mainSeg = timelines[0].segments.find((s) => s.seqName === 'lead_main')!;

    const { controller, play } = createMockController({
      getSource: () => DANCEFLOOR_SHAPED,
      getSongContext: () => dancefloor,
    });

    controller.enter({
      channelId: 1,
      startStep: introSeg.startStep,
      endStep: introSeg.endStep,
      seqName: 'lead_intro',
      patName: introSeg.patName,
      channelItemIndex: introSeg.channelItemIndex,
    }, { play: false });

    play.mockClear();
    controller.enter({
      channelId: 1,
      startStep: mainSeg.startStep,
      endStep: mainSeg.endStep,
      seqName: 'lead_main',
      patName: mainSeg.patName,
      channelItemIndex: mainSeg.channelItemIndex,
    }, { play: false });

    expect(play).not.toHaveBeenCalled();
  });
});
