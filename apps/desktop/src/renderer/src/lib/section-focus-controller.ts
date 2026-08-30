import type { PlaybackManager } from '@beatbax/app-core/playback';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import {
  buildArrangementSliceSource,
  findArrangementSliceAnchorByName,
  findArrangementSliceAnchorAtCursor,
  findAdjacentSectionAnchor,
  listArrangementSections,
  resolveSectionFocus,
  type ArrangementSliceAnchor,
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
  playFocused: (loop?: boolean) => void;
  revealInEditor: () => void;
  focusAtName: (name: string, options?: { play?: boolean }) => void;
  focusAtCursor: (lineNumber: number, column: number, options?: { play?: boolean }) => void;
  focusAdjacentSection: (direction: 'prev' | 'next', options?: { play?: boolean }) => void;
  refresh: () => void;
  isActive: () => boolean;
  getFocusInfo: () => SectionFocusInfo | null;
  dispose: () => void;
}

export function createSectionFocusController(opts: SectionFocusControllerOptions): SectionFocusController {
  let active = false;
  let lastRequest: ArrangementSlicePlayRequest | null = null;
  let lastInfo: SectionFocusInfo | null = null;

  const toAnchor = (request: ArrangementSlicePlayRequest): ArrangementSliceAnchor => ({
    channelId: request.channelId,
    startStep: request.startStep,
    endStep: request.endStep,
    seqName: request.seqName,
    patName: request.patName,
    channelItemIndex: request.channelItemIndex,
  });

  const exit = (): void => {
    if (!active && !lastInfo) return;
    active = false;
    lastRequest = null;
    lastInfo = null;
    opts.getPatternGrid()?.setSectionFocus(null);
    opts.getPatternGrid()?.setSliceHighlight(null);
    opts.sectionFocusEditor.clearFocus();
    opts.playbackManager.stop();
    opts.onFocusChange?.(null);
    opts.eventBus.emit('section:focus-exit', undefined);
  };

  const playFocused = (loop?: boolean): void => {
    const ctx = opts.getSongContext();
    if (!lastRequest || !ctx?.song) {
      opts.onStatus?.('Nothing focused to play');
      return;
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
      return;
    }
    if (result.warning) opts.onStatus?.(result.warning);
    void opts.playbackManager.play(result.source, { ephemeral: true }).catch(() => {
      /* playback errors surface via playback:error */
    });
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
    enter(
      {
        channelId: anchor.channelId,
        startStep: anchor.startStep,
        endStep: anchor.endStep,
        seqName: anchor.seqName,
        patName: anchor.patName,
        channelItemIndex: anchor.channelItemIndex,
      },
      { play: options?.play ?? false },
    );
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
    enter(
      {
        channelId: anchor.channelId,
        startStep: anchor.startStep,
        endStep: anchor.endStep,
        seqName: anchor.seqName,
        patName: anchor.patName,
        channelItemIndex: anchor.channelItemIndex,
      },
      { play: options?.play ?? false },
    );
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
    enter(
      {
        channelId: anchor.channelId,
        startStep: anchor.startStep,
        endStep: anchor.endStep,
        seqName: anchor.seqName,
        patName: anchor.patName,
        channelItemIndex: anchor.channelItemIndex,
      },
      { play: options?.play ?? false },
    );
  };

  const refresh = (): void => {
    if (!active || !lastRequest) return;
    const ctx = opts.getSongContext();
    if (!ctx?.song) return;
    const info = resolveSectionFocus(
      opts.getSource(),
      ctx.song,
      ctx.ast,
      toAnchor(lastRequest),
    );
    if (!info) {
      exit();
      return;
    }
    lastInfo = info;
    opts.getPatternGrid()?.setSectionFocus(info);
    opts.getPatternGrid()?.setSliceHighlight(info.window);
    opts.sectionFocusEditor.applyFocus(info);
    opts.onFocusChange?.(info);
  };

  const enter = (request: ArrangementSlicePlayRequest, options?: { play?: boolean; loop?: boolean }): void => {
    const ctx = opts.getSongContext();
    if (!ctx?.song) {
      opts.onStatus?.('Parse the song first to focus a section');
      return;
    }
    const source = opts.getSource();
    const info = resolveSectionFocus(source, ctx.song, ctx.ast, toAnchor(request));
    if (!info) {
      opts.onStatus?.('Could not resolve section focus');
      return;
    }

    active = true;
    lastRequest = request;
    lastInfo = info;

    opts.getPatternGrid()?.setSectionFocus(info);
    opts.getPatternGrid()?.setSliceHighlight(info.window);
    opts.sectionFocusEditor.applyFocus(info);
    opts.sectionFocusEditor.revealFocus(info);
    opts.onFocusChange?.(info);
    opts.eventBus.emit('section:focus-enter', { info, request });

    if (options?.play !== false) {
      playFocused(options?.loop);
    }
  };

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
    getFocusInfo: () => lastInfo,
    dispose: () => {
      exit();
      opts.sectionFocusEditor.dispose();
    },
  };
}
