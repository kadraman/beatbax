import type { PlaybackManager } from '@beatbax/app-core/playback';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import {
  buildArrangementSliceSource,
  deriveSectionFocusIdentity,
  findArrangementSliceAnchorByName,
  findArrangementSliceAnchorAtCursor,
  findArrangementSliceAnchorBySectionIdentity,
  findAdjacentSectionAnchor,
  listArrangementSections,
  resolveSectionFocus,
  type ArrangementSliceAnchor,
  type SectionFocusIdentity,
  type SectionFocusInfo,
} from '@beatbax/app-core/editor/arrangement-slice';
import type { DesktopPatternGridHandle, ArrangementSlicePlayRequest } from '../components/panels/DesktopPatternGrid';
import type { SectionFocusEditorHandle } from './section-focus-editor';

export interface SectionFocusControllerOptions {
  getSource: () => string;
  getSongContext: () => { song: unknown; ast?: unknown } | null;
  getPatternGrid: () => DesktopPatternGridHandle | null;
  sectionFocusEditor: SectionFocusEditorHandle;
  playbackManager: PlaybackManager;
  eventBus: EventBus;
  onStatus?: (message: string) => void;
  onFocusChange?: (info: SectionFocusInfo | null) => void;
}

export interface SectionFocusController {
  enter: (request: ArrangementSlicePlayRequest, options?: { play?: boolean; loop?: boolean }) => void;
  exit: () => void;
  /** Play the focused section slice. Returns false when focus was cleared (caller may play full song). */
  playFocused: (loop?: boolean) => boolean;
  revealInEditor: () => void;
  focusAtName: (name: string, options?: { play?: boolean }) => void;
  focusAtCursor: (lineNumber: number, column: number, options?: { play?: boolean }) => void;
  focusAdjacentSection: (direction: 'prev' | 'next', options?: { play?: boolean }) => void;
  refresh: () => void;
  isActive: () => boolean;
  isSlicePlaybackActive: () => boolean;
  getFocusInfo: () => SectionFocusInfo | null;
  dispose: () => void;
}

export function createSectionFocusController(opts: SectionFocusControllerOptions): SectionFocusController {
  let active = false;
  let lastRequest: ArrangementSlicePlayRequest | null = null;
  let lastInfo: SectionFocusInfo | null = null;
  let lastIdentity: SectionFocusIdentity | null = null;
  let slicePlaybackActive = false;

  const clearSlicePlaybackRemap = (): void => {
    slicePlaybackActive = false;
    opts.getPatternGrid()?.setSlicePlaybackRemap(false);
  };

  const toAnchor = (request: ArrangementSlicePlayRequest): ArrangementSliceAnchor => ({
    channelId: request.channelId,
    startStep: request.startStep,
    endStep: request.endStep,
    seqName: request.seqName,
    patName: request.patName,
    channelItemIndex: request.channelItemIndex,
  });

  const toRequest = (anchor: ArrangementSliceAnchor): ArrangementSlicePlayRequest => ({
    channelId: anchor.channelId,
    startStep: anchor.startStep,
    endStep: anchor.endStep,
    seqName: anchor.seqName,
    patName: anchor.patName,
    channelItemIndex: anchor.channelItemIndex,
  });

  const applyFocusUi = (info: SectionFocusInfo): void => {
    opts.getPatternGrid()?.setSectionFocus(info);
    opts.getPatternGrid()?.setSliceHighlight(info.window);
    opts.sectionFocusEditor.applyFocus(info);
    opts.onFocusChange?.(info);
  };

  const exit = (): void => {
    if (!active && !lastInfo) return;
    active = false;
    lastRequest = null;
    lastInfo = null;
    lastIdentity = null;
    clearSlicePlaybackRemap();
    opts.getPatternGrid()?.setSectionFocus(null);
    opts.getPatternGrid()?.setSliceHighlight(null);
    opts.sectionFocusEditor.clearFocus();
    opts.playbackManager.stop();
    opts.onFocusChange?.(null);
    opts.eventBus.emit('section:focus-exit', undefined);
  };

  const playFocused = (loop?: boolean): boolean => {
    const ctx = opts.getSongContext();
    if (!lastRequest || !ctx?.song) {
      opts.onStatus?.('Nothing focused to play');
      return false;
    }
    const useLoop = loop ?? opts.playbackManager.getLoop();
    const result = buildArrangementSliceSource(
      opts.getSource(),
      ctx.song,
      ctx.ast,
      toAnchor(lastRequest),
      { loop: useLoop },
    );
    if (!result) {
      opts.onStatus?.('Could not build arrangement slice');
      exit();
      return false;
    }
    if (result.warning) opts.onStatus?.(result.warning);
    if (opts.playbackManager.isPlaying()) {
      opts.playbackManager.stop();
    }
    slicePlaybackActive = true;
    opts.getPatternGrid()?.setSlicePlaybackRemap(true);
    void opts.playbackManager.play(result.source, { ephemeral: true }).catch(() => {
      /* playback errors surface via playback:error */
    });
    return true;
  };

  const revealInEditor = (): void => {
    if (!lastInfo) return;
    opts.sectionFocusEditor.revealFocus(lastInfo);
  };

  const focusAtCursor = (lineNumber: number, column: number, options?: { play?: boolean }): void => {
    const ctx = opts.getSongContext();
    if (!ctx?.song) {
      opts.onStatus?.('Parse the song first to focus a section');
      return;
    }
    const anchor = findArrangementSliceAnchorAtCursor(
      opts.getSource(),
      ctx.song,
      ctx.ast,
      lineNumber,
      column,
    );
    if (!anchor) {
      opts.onStatus?.('No section found at cursor');
      return;
    }
    enter(toRequest(anchor), { play: options?.play ?? false });
  };

  const focusAtName = (name: string, options?: { play?: boolean }): void => {
    const ctx = opts.getSongContext();
    if (!ctx?.song) {
      opts.onStatus?.('Parse the song first to focus a section');
      return;
    }
    const anchor = findArrangementSliceAnchorByName(opts.getSource(), ctx.song, ctx.ast, name);
    if (!anchor) {
      opts.onStatus?.(`'${name}' is not on a channel timeline`);
      return;
    }
    enter(toRequest(anchor), { play: options?.play ?? false });
  };

  const focusAdjacentSection = (direction: 'prev' | 'next', options?: { play?: boolean }): void => {
    if (!active || !lastInfo) {
      opts.onStatus?.('Section focus is not active');
      return;
    }
    const ctx = opts.getSongContext();
    if (!ctx?.song) return;
    const sections = listArrangementSections(opts.getSource(), ctx.song, ctx.ast);
    const anchor = findAdjacentSectionAnchor(sections, lastInfo.window, direction);
    if (!anchor) {
      opts.onStatus?.(direction === 'prev' ? 'Already at first section' : 'Already at last section');
      return;
    }
    enter(toRequest(anchor), { play: options?.play ?? false });
  };

  const refresh = (): void => {
    if (!active || !lastIdentity) return;
    const ctx = opts.getSongContext();
    if (!ctx?.song) return;

    const wasPlaying = opts.playbackManager.isPlaying();

    const anchor = findArrangementSliceAnchorBySectionIdentity(
      opts.getSource(),
      ctx.song,
      ctx.ast,
      lastIdentity,
    );
    if (!anchor) {
      const name = lastIdentity.headword ?? lastIdentity.seqName ?? 'Section';
      exit();
      opts.onStatus?.(`Section focus ended — ${name} is no longer in the song`);
      return;
    }

    const request = toRequest(anchor);
    const info = resolveSectionFocus(opts.getSource(), ctx.song, ctx.ast, anchor);
    if (!info) {
      exit();
      return;
    }

    lastRequest = request;
    lastInfo = info;
    lastIdentity = deriveSectionFocusIdentity(info);
    applyFocusUi(info);

    if (wasPlaying) {
      playFocused();
    }
  };

  const enter = (request: ArrangementSlicePlayRequest, options?: { play?: boolean; loop?: boolean }): void => {
    const ctx = opts.getSongContext();
    if (!ctx?.song) {
      opts.onStatus?.('Parse the song first to focus a section');
      return;
    }
    const resumeSlicePlayback = slicePlaybackActive && opts.playbackManager.isPlaying();
    const shouldPlay = options?.play === true
      || (options?.play === false && resumeSlicePlayback);
    const source = opts.getSource();
    const info = resolveSectionFocus(source, ctx.song, ctx.ast, toAnchor(request));
    if (!info) {
      opts.onStatus?.('Could not resolve section focus');
      return;
    }

    if (resumeSlicePlayback || shouldPlay) {
      opts.playbackManager.stop();
    }

    active = true;
    lastRequest = request;
    lastInfo = info;
    lastIdentity = deriveSectionFocusIdentity(info);

    applyFocusUi(info);
    opts.sectionFocusEditor.revealFocus(info);
    opts.eventBus.emit('section:focus-enter', { info, request });

    if (shouldPlay) {
      playFocused(options?.loop);
    }
  };

  const unsubStopped = opts.eventBus.on('playback:stopped', () => {
    clearSlicePlaybackRemap();
  });

  return {
    enter,
    exit,
    playFocused,
    revealInEditor,
    focusAtName,
    focusAtCursor,
    focusAdjacentSection,
    refresh,
    isActive: () => active,
    isSlicePlaybackActive: () => slicePlaybackActive,
    getFocusInfo: () => lastInfo,
    dispose: () => {
      unsubStopped();
      exit();
      opts.sectionFocusEditor.dispose();
    },
  };
}
