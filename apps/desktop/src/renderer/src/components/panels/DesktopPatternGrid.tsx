import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
} from 'react';
import type { Root } from 'react-dom/client';
import {
  channelStates,
  isChannelAudible,
  toggleChannelMuted,
  toggleChannelSoloed,
  type ChannelInfo,
} from '@beatbax/app-core/stores/channel.store';
import type { ArrangementSectionBlock, SectionFocusInfo } from '@beatbax/app-core/editor/arrangement-slice';
import { buildChannelTimelines, listArrangementSections, segmentMatchesSectionFocus } from '@beatbax/app-core/editor/arrangement-slice';
import { collectStepBoundaries, type LoopRange } from '@beatbax/app-core/playback/playback-range';
import { playbackBpm, playbackStatus } from '@beatbax/app-core/stores/playback.store';
import {
  clearPlaybackLoopRange,
  getActivePlaybackLoopRange,
  playbackLoopEnabled,
  playbackLoopRange,
  playbackStartStep,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';
import {
  contentWidth,
  edgeAutoscrollDelta,
  fitPxPerStep,
  resolveAutoPxPerStep,
  steppedPxPerStep,
  zoomAboutAnchor,
} from '@beatbax/app-core/playback/pattern-grid-zoom';
import { getChannelColor } from '@beatbax/ui-tokens/channel-meta';
import { mountReactRoot, unmountReactRoot } from '../../utils/react-root';
import {
  idlePlayheadStep,
  resolveTimelineGesture,
  rowStepSpans,
  stepFromClientX,
  type TimelineDragKind,
} from '@beatbax/app-core/playback/pattern-grid-timeline';

type ZoomMode = 'auto' | 'fit' | 'manual';

/** Hide block text when the block is narrower than this many CSS pixels. */
const COMPACT_LABEL_PX = 28;

/** Match playback engine: 16th-note steps → `60 / bpm / 4` seconds each. */
function stepSecondsAtBpm(bpm: number): number {
  return 60 / Math.max(1, bpm) / 4;
}

function formatStepClock(step: number, bpm: number): string {
  const sec = Math.max(0, step) * stepSecondsAtBpm(bpm);
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface Segment {
  patName: string;
  seqName: string | null;
  channelItemIndex: number | null;
  repeatIndex: number;
  count: number;
}

interface PatternGridRow {
  channelId: number;
  color: string;
  segs: Segment[];
  displayTotal: number;
}

export interface ArrangementSlicePlayRequest {
  channelId: number;
  startStep: number;
  endStep: number;
  seqName: string | null;
  patName: string;
  /** 0-based top-level channel seq/pat item (e.g. second `lead_seq`). */
  channelItemIndex?: number | null;
  /** Pass of a top-level `name*N` (0-based). Omit to cover every pass of that item. */
  repeatIndex?: number | null;
  loop?: boolean;
  /** When false, enter focus without starting playback (use transport Play). */
  autoPlay?: boolean;
}

interface DesktopPatternGridProps {
  gridRef: RefCallback<DesktopPatternGridHandle>;
  /** Pattern selection changed: name to highlight in the editor, or `null` when cleared. */
  onNavigate?: (patName: string | null) => void;
  onPlaySlice?: (request: ArrangementSlicePlayRequest) => void;
  /** Ruler click or start-flag drop; owns setting the pending start and seeking playback. */
  onPickStart?: (startStep: number) => void;
  /** Ruler loop drag; owns setting the range, Loop (`enableLoop` for a new range) and seeking playback. */
  onPickLoop?: (loop: LoopRange, enableLoop: boolean) => void;
}

export interface DesktopPatternGridHandle {
  setSong: (song: unknown, ast?: unknown, source?: string) => void;
  setPosition: (channelId: number, progress: number) => void;
  setGlobalProgress: (progress: number) => void;
  pausePositions: () => void;
  resumePositions: () => void;
  clearPositions: () => void;
  /** Highlight the active arrangement-slice column (step window). */
  setSliceHighlight: (window: { startStep: number; endStep: number } | null) => void;
  /** Section focus banner + editor highlight metadata. */
  setSectionFocus: (info: SectionFocusInfo | null) => void;
  /** When true, map playback progress into the focused section column (slice playback only). */
  setSlicePlaybackRemap: (remap: boolean) => void;
  /** Clear same-name pattern selection (grid + editor highlight). */
  clearPatternSelection: () => void;
  dispose: () => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hashPatternName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function abbreviatePatternName(name: string, maxLen = 9): string {
  if (name.length <= maxLen) return name;
  const keepHead = Math.max(3, Math.floor((maxLen - 1) / 2));
  const keepTail = Math.max(2, maxLen - keepHead - 1);
  return `${name.slice(0, keepHead)}…${name.slice(-keepTail)}`;
}

/** Map 0–1 playback progress into a step window on the full-song grid. */
function mapProgressIntoWindow(
  progress: number,
  window: { startStep: number; endStep: number } | null | undefined,
  globalEventTotal: number,
): number {
  if (!window || globalEventTotal <= 0) return progress;
  const sliceSteps = window.endStep - window.startStep;
  if (sliceSteps <= 0) return progress;
  const start = window.startStep / globalEventTotal;
  const width = sliceSteps / globalEventTotal;
  return start + progress * width;
}

function sectionWindowStartPct(
  window: { startStep: number; endStep: number } | null | undefined,
  globalEventTotal: number,
): number | null {
  if (!window || globalEventTotal <= 0) return null;
  return Math.min(99.5, Math.max(0, (window.startStep / globalEventTotal) * 100));
}

/** Overlay rect as % of the scrolled content strip (tracks fill that strip). */
function sectionWindowRect(
  window: { startStep: number; endStep: number } | null | undefined,
  globalEventTotal: number,
): { left: string; width: string } | null {
  if (!window || globalEventTotal <= 0) return null;
  const startPct = window.startStep / globalEventTotal;
  const widthPct = (window.endStep - window.startStep) / globalEventTotal;
  if (widthPct <= 0) return null;
  return {
    left: `${startPct * 100}%`,
    width: `${widthPct * 100}%`,
  };
}

/** Horizontal offset of a global step inside the scrolled content strip. */
function stepOffsetLeft(step: number, globalEventTotal: number): string {
  const pct = globalEventTotal > 0 ? Math.min(1, Math.max(0, step / globalEventTotal)) : 0;
  return `${pct * 100}%`;
}

function channelPositionsAtPct(
  rows: PatternGridRow[],
  pct: number,
): Record<number, number> {
  return Object.fromEntries(rows.map((row) => [row.channelId, pct]));
}

function buildRows(song: any, ast?: any, source = ''): {
  rows: PatternGridRow[];
  globalEventTotal: number;
  sectionBlocks: ArrangementSectionBlock[];
} {
  const channels: any[] = song?.channels ?? [];
  if (channels.length === 0) {
    return { rows: [], globalEventTotal: 1, sectionBlocks: [] };
  }

  const timelines = buildChannelTimelines(source, song, ast);
  const rowData = timelines.map((timeline) => {
    const segs: Segment[] = timeline.segments.map((s) => ({
      patName: s.patName,
      seqName: s.seqName,
      channelItemIndex: s.channelItemIndex,
      repeatIndex: s.repeatIndex,
      count: Math.max(1, s.endStep - s.startStep),
    }));
    const displayTotal = Math.max(1, segs.reduce((acc, seg) => acc + seg.count, 0));
    const ch = channels.find((c) => (c?.id ?? 0) === timeline.channelId) ?? { id: timeline.channelId };
    return { ch, segs, displayTotal };
  });

  const globalEventTotal = Math.max(1, ...rowData.map((row) => row.displayTotal));
  const chip: string = song?.chip ?? 'gameboy';
  return {
    globalEventTotal,
    sectionBlocks: listArrangementSections(source, song, ast),
    rows: rowData.map((row) => ({
      channelId: row.ch?.id ?? 0,
      color: getChannelColor(chip, row.ch?.id ?? 0),
      segs: row.segs,
      displayTotal: row.displayTotal,
    })),
  };
}

interface TimelineDrag {
  kind: TimelineDragKind;
  pointerId: number;
  anchorStep: number;
  originX: number;
  moved: boolean;
}

function stepPct(step: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (step / total) * 100)) : 0;
}

function DesktopPatternGrid({
  gridRef,
  onNavigate,
  onPlaySlice,
  onPickStart,
  onPickLoop,
}: DesktopPatternGridProps): React.JSX.Element {
  const [rows, setRows] = useState<PatternGridRow[]>([]);
  const [sectionBlocks, setSectionBlocks] = useState<ArrangementSectionBlock[]>([]);
  const [globalEventTotal, setGlobalEventTotal] = useState(1);
  const [positions, setPositions] = useState<Record<number, number>>({});
  const [globalPct, setGlobalPct] = useState<number | null>(null);
  const [globalLeft, setGlobalLeft] = useState<string>('0%');
  const [focusColumnRect, setFocusColumnRect] = useState<{ left: string; width: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [channelInfo, setChannelInfo] = useState<Record<number, ChannelInfo>>(channelStates.get());
  const [sliceWindow, setSliceWindow] = useState<{ startStep: number; endStep: number } | null>(null);
  const [sectionFocus, setSectionFocusState] = useState<SectionFocusInfo | null>(null);
  const sectionFocusRef = useRef<SectionFocusInfo | null>(null);
  const slicePlaybackRemapRef = useRef(false);
  const globalEventTotalRef = useRef(1);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const hscrollRef = useRef<HTMLDivElement | null>(null);
  const firstTrackRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<PatternGridRow[]>([]);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const selectedPatNameRef = useRef<string | null>(null);
  const onPlaySliceRef = useRef(onPlaySlice);
  onPlaySliceRef.current = onPlaySlice;
  const onPickLoopRef = useRef(onPickLoop);
  useEffect(() => {
    onPickLoopRef.current = onPickLoop;
  }, [onPickLoop]);
  const onPickStartRef = useRef(onPickStart);
  useEffect(() => {
    onPickStartRef.current = onPickStart;
  }, [onPickStart]);
  const [pendingStart, setPendingStart] = useState<number | null>(playbackStartStep.get());
  const [loopRange, setLoopRangeState] = useState<LoopRange | null>(playbackLoopRange.get());
  const [loopEnabled, setLoopEnabled] = useState(playbackLoopEnabled.get());
  const [bpm, setBpm] = useState(playbackBpm.get());
  const [dragPreview, setDragPreview] = useState<{ start?: number; loop?: LoopRange | null } | null>(null);
  const [rangeOverlay, setRangeOverlay] = useState<{
    loopRect: { left: string; width: string } | null;
    startLeft: string | null;
  }>({ loopRect: null, startLeft: null });
  const rangeShownRef = useRef<{ loop: LoopRange | null; start: number | null }>({ loop: null, start: null });
  const rulerTrackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<TimelineDrag | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('auto');
  const [selectedPatName, setSelectedPatName] = useState<string | null>(null);
  const [manualPxPerStep, setManualPxPerStep] = useState(4);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [hscrollTrackWidth, setHscrollTrackWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const pxPerStepRef = useRef(4);
  const hScrollDraggingRef = useRef(false);

  useEffect(() => channelStates.subscribe((states) => {
    setChannelInfo({ ...states });
  }), []);

  useEffect(() => playbackStartStep.subscribe((step) => setPendingStart(step)), []);
  useEffect(() => playbackLoopRange.subscribe((range) => setLoopRangeState(range)), []);
  useEffect(() => playbackLoopEnabled.subscribe((enabled) => setLoopEnabled(enabled)), []);
  useEffect(() => playbackBpm.subscribe((value) => setBpm(value)), []);

  const stepBoundaries = useMemo(
    () => collectStepBoundaries(rows.map((row) => rowStepSpans(row.segs.map((seg) => seg.count))), globalEventTotal),
    [rows, globalEventTotal],
  );

  const showIdlePlayhead = useCallback((
    gridRows: PatternGridRow[] = rowsRef.current,
    total: number = globalEventTotalRef.current,
  ): void => {
    const step = idlePlayheadStep({
      focusWindow: sectionFocusRef.current?.window,
      loop: getActivePlaybackLoopRange(),
      startStep: playbackStartStep.get(),
    });
    const pct = Math.min(99.5, stepPct(step, total));
    setPositions(channelPositionsAtPct(gridRows, pct));
    setGlobalPct(pct);
    setPaused(false);
  }, []);

  const rangeMountedRef = useRef(false);
  useEffect(() => {
    if (!rangeMountedRef.current) {
      rangeMountedRef.current = true;
      return;
    }
    if (rowsRef.current.length === 0 || playbackStatus.get() !== 'stopped') return;
    showIdlePlayhead();
  }, [pendingStart, loopRange, loopEnabled, showIdlePlayhead]);

  const rulerStepAt = (clientX: number): number => {
    const track = rulerTrackRef.current;
    if (!track) return 0;
    return stepFromClientX(clientX, track.getBoundingClientRect(), globalEventTotalRef.current);
  };

  const beginTimelineDrag = (event: ReactPointerEvent<HTMLElement>, kind: TimelineDragKind): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      anchorStep: rulerStepAt(event.clientX),
      originX: event.clientX,
      moved: false,
    };
    try { rulerTrackRef.current?.setPointerCapture(event.pointerId); } catch { /* jsdom / detached */ }
  };

  const onRulerPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.abs(event.clientX - drag.originX) < 4) return;
    drag.moved = true;
    const scroller = scrollerRef.current;
    if (scroller) {
      const delta = edgeAutoscrollDelta(event.clientX, scroller.getBoundingClientRect());
      if (delta !== 0) scroller.scrollLeft += delta;
    }
    const snap = event.altKey ? 'step' as const : 'pattern' as const;
    const result = resolveTimelineGesture(
      drag.kind, drag.anchorStep, rulerStepAt(event.clientX), true, stepBoundaries, playbackLoopRange.get(),
      { snap },
    );
    if (result.kind === 'start') setDragPreview({ start: result.startStep });
    else if (result.kind === 'loop') setDragPreview({ loop: result.loop });
  };

  const onRulerPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragPreview(null);
    try { rulerTrackRef.current?.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    const snap = event.altKey ? 'step' as const : 'pattern' as const;
    const result = resolveTimelineGesture(
      drag.kind, drag.anchorStep, rulerStepAt(event.clientX), drag.moved, stepBoundaries, playbackLoopRange.get(),
      { snap },
    );
    if (result.kind === 'none') return;
    if (result.kind === 'start') {
      if (onPickStartRef.current) {
        onPickStartRef.current(result.startStep);
      } else {
        setPlaybackStartStep(result.startStep);
        if (getActivePlaybackLoopRange()) playbackLoopEnabled.set(false);
      }
      return;
    }
    const enableLoop = drag.kind === 'new';
    if (onPickLoopRef.current) {
      onPickLoopRef.current(result.loop, enableLoop);
    } else {
      setPlaybackLoopRange(result.loop);
      if (enableLoop) playbackLoopEnabled.set(true);
    }
  };

  const onRulerPointerCancel = (): void => {
    dragRef.current = null;
    setDragPreview(null);
  };

  useEffect(() => {
    sectionFocusRef.current = sectionFocus;
  }, [sectionFocus]);

  useEffect(() => {
    globalEventTotalRef.current = globalEventTotal;
  }, [globalEventTotal]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const pxPerStep = useMemo(() => {
    if (viewportWidth <= 0 || globalEventTotal <= 0) return 4;
    if (zoomMode === 'fit') return fitPxPerStep(viewportWidth, globalEventTotal);
    if (zoomMode === 'manual') return manualPxPerStep;
    return resolveAutoPxPerStep(viewportWidth, globalEventTotal);
  }, [viewportWidth, globalEventTotal, zoomMode, manualPxPerStep]);

  useEffect(() => {
    pxPerStepRef.current = pxPerStep;
  }, [pxPerStep]);

  const trackContentWidth = useMemo(
    () => contentWidth(viewportWidth, globalEventTotal, pxPerStep),
    [viewportWidth, globalEventTotal, pxPerStep],
  );
  const needsHScroll = viewportWidth > 0 && trackContentWidth > viewportWidth + 0.5;
  const maxScrollLeft = Math.max(0, trackContentWidth - viewportWidth);
  const scrollTrackWidth = hscrollTrackWidth > 0 ? hscrollTrackWidth : viewportWidth;
  const hScrollThumbWidth = needsHScroll && trackContentWidth > 0
    ? Math.max(24, (viewportWidth / trackContentWidth) * scrollTrackWidth)
    : 0;
  const hScrollThumbLeft = needsHScroll && maxScrollLeft > 0
    ? (scrollLeft / maxScrollLeft) * Math.max(0, scrollTrackWidth - hScrollThumbWidth)
    : 0;

  const setScrollerScrollLeft = useCallback((next: number): void => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const clamped = Math.min(maxScrollLeft, Math.max(0, next));
    scroller.scrollLeft = clamped;
    setScrollLeft(scroller.scrollLeft);
  }, [maxScrollLeft]);

  const onScrollerScroll = useCallback((): void => {
    if (hScrollDraggingRef.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setScrollLeft(scroller.scrollLeft);
  }, []);

  const onHScrollTrackPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!needsHScroll || maxScrollLeft <= 0) return;
    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    const travel = Math.max(1, rect.width - hScrollThumbWidth);
    const x = event.clientX - rect.left - hScrollThumbWidth / 2;
    setScrollerScrollLeft((x / travel) * maxScrollLeft);
  }, [hScrollThumbWidth, maxScrollLeft, needsHScroll, setScrollerScrollLeft]);

  const onHScrollThumbPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!needsHScroll || maxScrollLeft <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const thumb = event.currentTarget;
    const startX = event.clientX;
    const startScroll = scrollerRef.current?.scrollLeft ?? scrollLeft;
    const trackWidth = hscrollRef.current?.clientWidth || scrollTrackWidth;
    const travel = Math.max(1, trackWidth - hScrollThumbWidth);
    hScrollDraggingRef.current = true;
    thumb.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX;
      setScrollerScrollLeft(startScroll + (dx / travel) * maxScrollLeft);
    };
    const onUp = (ev: PointerEvent): void => {
      hScrollDraggingRef.current = false;
      thumb.releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [hScrollThumbWidth, maxScrollLeft, needsHScroll, scrollLeft, scrollTrackWidth, setScrollerScrollLeft]);

  const applyZoom = useCallback((nextMode: ZoomMode, nextManualPx?: number, anchorClientX?: number): void => {
    const scroller = scrollerRef.current;
    const track = rulerTrackRef.current ?? firstTrackRef.current;
    const oldPx = pxPerStepRef.current;
    let newPx = oldPx;
    if (nextMode === 'fit') {
      newPx = fitPxPerStep(viewportWidth, globalEventTotalRef.current);
    } else if (nextMode === 'auto') {
      newPx = resolveAutoPxPerStep(viewportWidth, globalEventTotalRef.current);
    } else if (nextManualPx !== undefined) {
      newPx = nextManualPx;
    }
    let nextScroll: number | null = null;
    if (scroller && track && anchorClientX !== undefined && oldPx > 0) {
      const anchorStep = stepFromClientX(
        anchorClientX,
        track.getBoundingClientRect(),
        globalEventTotalRef.current,
      );
      nextScroll = zoomAboutAnchor({
        oldPxPerStep: oldPx,
        newPxPerStep: newPx,
        anchorStep,
        scrollLeft: scroller.scrollLeft,
      });
    }
    setZoomMode(nextMode);
    if (nextMode === 'manual' && nextManualPx !== undefined) setManualPxPerStep(nextManualPx);
    if (nextScroll !== null && scroller) {
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
        el.scrollLeft = Math.min(maxScroll, Math.max(0, nextScroll!));
        setScrollLeft(el.scrollLeft);
      });
    }
  }, [viewportWidth]);

  const updateGlobalLeft = useCallback((pct: number | null): void => {
    if (pct === null) return;
    setGlobalLeft(`${pct}%`);
  }, []);

  const updateFocusColumnRect = useCallback((): void => {
    setFocusColumnRect(sectionWindowRect(
      sectionFocusRef.current?.window,
      globalEventTotalRef.current,
    ));
  }, []);

  useLayoutEffect(() => {
    updateGlobalLeft(globalPct);
    updateFocusColumnRect();
  }, [globalPct, rows, sectionFocus, updateGlobalLeft, updateFocusColumnRect]);

  const updateRangeOverlay = useCallback((): void => {
    const { loop, start } = rangeShownRef.current;
    const total = globalEventTotalRef.current;
    setRangeOverlay({
      loopRect: loop ? sectionWindowRect(loop, total) : null,
      startLeft: start !== null ? stepOffsetLeft(start, total) : null,
    });
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return undefined;
    const measure = (): void => {
      setViewportWidth(scroller.clientWidth);
      updateGlobalLeft(globalPct);
      updateFocusColumnRect();
      updateRangeOverlay();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [globalPct, rows, sectionFocus, updateGlobalLeft, updateFocusColumnRect, updateRangeOverlay]);

  useEffect(() => {
    if (!needsHScroll) {
      setHscrollTrackWidth(0);
      return undefined;
    }
    const track = hscrollRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const measure = (): void => setHscrollTrackWidth(track.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [needsHScroll, rows, zoomMode]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (scroller.scrollLeft > maxScrollLeft) {
      scroller.scrollLeft = maxScrollLeft;
      setScrollLeft(maxScrollLeft);
    }
  }, [maxScrollLeft]);

  useImperativeHandle(gridRef, () => ({
    setSong: (song, ast, source) => {
      const next = buildRows(song, ast, source ?? '');
      setRows(next.rows);
      setSectionBlocks(next.sectionBlocks);
      globalEventTotalRef.current = next.globalEventTotal;
      setGlobalEventTotal(next.globalEventTotal);
      setZoomMode('auto');
      // Keep same-name highlight across re-parse / section-focus play; drop only if gone.
      {
        const prev = selectedPatNameRef.current;
        const nextSelected = prev
          && next.rows.some((row) => row.segs.some((seg) => seg.patName === prev))
          ? prev
          : null;
        selectedPatNameRef.current = nextSelected;
        setSelectedPatName(nextSelected);
        if (prev && !nextSelected) onNavigateRef.current?.(null);
      }
      setSliceWindow(null);
      setSectionFocusState(null);
      sectionFocusRef.current = null;
      if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
      setScrollLeft(0);
      if (next.rows.length > 0 && playbackStatus.get() === 'stopped') {
        showIdlePlayhead(next.rows, next.globalEventTotal);
      } else {
        setPositions({});
        setGlobalPct(null);
        setPaused(false);
      }
    },
    setPosition: (channelId, progress) => {
      const window = slicePlaybackRemapRef.current ? sectionFocusRef.current?.window : null;
      const mapped = mapProgressIntoWindow(
        progress,
        window,
        globalEventTotalRef.current,
      );
      const pct = Math.min(99.5, Math.max(0, mapped * 100));
      setPositions((current) => ({ ...current, [channelId]: pct }));
      setPaused(false);
    },
    setGlobalProgress: (progress) => {
      const window = slicePlaybackRemapRef.current ? sectionFocusRef.current?.window : null;
      const mapped = mapProgressIntoWindow(
        progress,
        window,
        globalEventTotalRef.current,
      );
      const pct = Math.min(99.5, Math.max(0, mapped * 100));
      setGlobalPct(pct);
      setPaused(false);
    },
    pausePositions: () => setPaused(true),
    resumePositions: () => setPaused(false),
    clearPositions: () => showIdlePlayhead(),
    setSliceHighlight: (window) => setSliceWindow(window),
    setSlicePlaybackRemap: (remap) => {
      slicePlaybackRemapRef.current = remap;
    },
    clearPatternSelection: () => {
      if (selectedPatNameRef.current) onNavigateRef.current?.(null);
      selectedPatNameRef.current = null;
      setSelectedPatName(null);
    },
    setSectionFocus: (info) => {
      const prevWindow = sectionFocusRef.current?.window;
      sectionFocusRef.current = info;
      setSectionFocusState(info);
      setFocusColumnRect(sectionWindowRect(info?.window, globalEventTotalRef.current));
      const window = info?.window;
      const windowChanged = !prevWindow || !window
        || prevWindow.startStep !== window.startStep
        || prevWindow.endStep !== window.endStep;
      if (window && windowChanged) {
        const startPct = sectionWindowStartPct(window, globalEventTotalRef.current);
        if (startPct !== null) {
          setGlobalPct(startPct);
          setPositions(channelPositionsAtPct(rowsRef.current, startPct));
          setPaused(false);
        }
      }
    },
    dispose: () => {
      setRows([]);
      setSectionBlocks([]);
      setPositions({});
      setGlobalPct(null);
      setSliceWindow(null);
      setSectionFocusState(null);
      setZoomMode('auto');
      if (selectedPatNameRef.current) onNavigateRef.current?.(null);
      selectedPatNameRef.current = null;
      setSelectedPatName(null);
      dragRef.current = null;
      setDragPreview(null);
    },
  }), [showIdlePlayhead]);

  const empty = rows.length === 0;

  const sectionLane = useMemo(() => {
    if (rows.length === 0) return { blocks: [] as ArrangementSectionBlock[], tailEvents: 0, displayTotal: 0 };
    const refRow = rows.find((row) => row.segs.some((seg) => seg.seqName)) ?? rows[0];
    return {
      blocks: sectionBlocks,
      tailEvents: globalEventTotal - refRow.displayTotal,
      displayTotal: refRow.displayTotal,
    };
  }, [rows, globalEventTotal, sectionBlocks]);

  const showSectionLane = sectionLane.blocks.length > 0 && !!onPlaySlice;

  const draggingLoop = !!dragPreview && 'loop' in dragPreview;
  const shownLoop = draggingLoop ? dragPreview.loop ?? null : loopRange;
  const shownLoopInactive = !!shownLoop && !loopEnabled && !draggingLoop;
  const shownStart = dragPreview && 'start' in dragPreview ? dragPreview.start ?? null : pendingStart;
  const showStartMarker = (!shownLoop || shownLoopInactive) && shownStart !== null && shownStart > 0;

  useLayoutEffect(() => {
    rangeShownRef.current = { loop: shownLoop, start: showStartMarker ? shownStart : null };
    updateRangeOverlay();
  }, [shownLoop, shownStart, showStartMarker, rows, globalEventTotal, updateRangeOverlay]);

  const loopRect = shownLoop ? rangeOverlay.loopRect : null;
  const startMarkerLeft = showStartMarker ? rangeOverlay.startLeft : null;
  const stepLabel = (step: number): string => `step ${step + 1}`;

  const posStep = shownStart !== null && shownStart > 0 ? shownStart : 0;
  const navReadout = useMemo(() => {
    const position = posStep > 0
      ? { step: String(posStep), time: formatStepClock(posStep, bpm) }
      : null;
    if (!shownLoop) {
      return { position, loop: null as null | { steps: string; time: string; inactive: boolean } };
    }
    const loopStart = shownLoop.startStep;
    const loopEnd = Math.max(loopStart, shownLoop.endStep);
    if (loopEnd <= loopStart) {
      return { position, loop: null };
    }
    const loopEndDisplay = Math.max(loopStart, loopEnd - 1);
    return {
      position,
      loop: {
        steps: `${loopStart}–${loopEndDisplay}`,
        time: `${formatStepClock(loopStart, bpm)}–${formatStepClock(loopEnd, bpm)}`,
        inactive: shownLoopInactive,
      },
    };
  }, [bpm, posStep, shownLoop, shownLoopInactive]);

  // Non-passive wheel listener: React's onWheel is passive, so preventDefault
  // fails and macOS pinch / Ctrl+scroll never reaches applyZoom reliably.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const direction = event.deltaY < 0 ? 'in' : 'out';
        applyZoom('manual', steppedPxPerStep(pxPerStepRef.current, direction), event.clientX);
        return;
      }
      if (event.shiftKey) {
        event.preventDefault();
        scroller.scrollLeft += event.deltaY || event.deltaX;
      }
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [applyZoom, empty]);

  const rulerClearControl = loopRange ? (
    <button
      aria-label="Clear loop range"
      className="bb-pgrid__btn bb-pgrid__btn--clear-range"
      onClick={(event) => {
        event.stopPropagation();
        clearPlaybackLoopRange();
      }}
      title="Clear loop range"
      type="button"
    >
      ✕
    </button>
  ) : pendingStart !== null && pendingStart > 0 ? (
    <button
      aria-label="Clear start marker"
      className="bb-pgrid__btn bb-pgrid__btn--clear-range"
      onClick={(event) => {
        event.stopPropagation();
        setPlaybackStartStep(null);
      }}
      title="Clear start marker (play from the beginning)"
      type="button"
    >
      ✕
    </button>
  ) : (
    <span className="bb-pgrid__section-heading">Pos</span>
  );

  return (
    <div
      className="bb-pgrid"
      role="region"
      aria-label="Pattern grid"
      data-empty={empty ? 'true' : undefined}
      data-section-focus={sectionFocus ? 'true' : undefined}
      data-pat-select={selectedPatName ? 'true' : undefined}
      data-zoom-mode={zoomMode}
      style={{ ['--bb-pgrid-px-per-step' as string]: `${pxPerStep}px` }}
    >
      {empty ? null : (
        <>
          <div className="bb-pgrid__body">
            <div className="bb-pgrid__gutter" aria-hidden={false}>
              <div className="bb-pgrid__gutter-row bb-pgrid__gutter-row--ruler">
                <div className="bb-pgrid__controls bb-pgrid__controls--ruler">{rulerClearControl}</div>
                <span aria-hidden="true" className="bb-pgrid__dot bb-pgrid__dot--spacer" />
              </div>
              {showSectionLane ? (
                <div className="bb-pgrid__gutter-row bb-pgrid__gutter-row--sections">
                  <div className="bb-pgrid__controls bb-pgrid__controls--section">
                    <span className="bb-pgrid__section-heading">Seq</span>
                  </div>
                  <span aria-hidden="true" className="bb-pgrid__dot bb-pgrid__dot--spacer" />
                </div>
              ) : null}
              {rows.map((row) => {
                const info = channelInfo[row.channelId];
                return (
                  <div className="bb-pgrid__gutter-row" key={`gutter-${row.channelId}`}>
                    <div className="bb-pgrid__controls">
                      <button
                        aria-label={`Mute channel ${row.channelId}`}
                        aria-pressed={!!info?.muted}
                        className={`bb-pgrid__btn bb-pgrid__btn--mute${info?.muted ? ' bb-pgrid__btn--active' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleChannelMuted(row.channelId);
                        }}
                        title={`Mute channel ${row.channelId}`}
                        type="button"
                      >
                        M
                      </button>
                      <button
                        aria-label={`Solo channel ${row.channelId}`}
                        aria-pressed={!!info?.soloed}
                        className={`bb-pgrid__btn bb-pgrid__btn--solo${info?.soloed ? ' bb-pgrid__btn--active' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleChannelSoloed(row.channelId);
                        }}
                        title={`Solo channel ${row.channelId}`}
                        type="button"
                      >
                        S
                      </button>
                    </div>
                    <span
                      aria-hidden="true"
                      className="bb-pgrid__dot"
                      style={{ background: row.color, boxShadow: `0 0 5px ${hexToRgba(row.color, 0.5)}` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="bb-pgrid__scroll-col">
            <div
              className="bb-pgrid__scroller"
              onScroll={onScrollerScroll}
              ref={scrollerRef}
            >
              <div
                className="bb-pgrid__content"
                ref={contentRef}
                style={{ width: trackContentWidth > 0 ? `${trackContentWidth}px` : '100%' }}
              >
                {sectionFocus && focusColumnRect ? (
                  <div
                    aria-hidden="true"
                    className="bb-pgrid__focus-column"
                    style={focusColumnRect}
                  />
                ) : null}
                {loopRect ? (
                  <div
                    aria-hidden="true"
                    className={[
                      'bb-pgrid__loop-range',
                      dragPreview ? 'bb-pgrid__loop-range--preview' : '',
                      shownLoopInactive ? 'bb-pgrid__loop-range--inactive' : '',
                    ].filter(Boolean).join(' ')}
                    style={loopRect}
                  />
                ) : null}
                {startMarkerLeft ? (
                  <div
                    aria-hidden="true"
                    className="bb-pgrid__start-marker"
                    style={{ left: startMarkerLeft }}
                  />
                ) : null}
                <div
                  aria-hidden="true"
                  className={`bb-pgrid__cursor bb-pgrid__cursor--global${paused ? ' bb-pgrid__cursor--paused' : ''}`}
                  style={{ display: globalPct === null ? 'none' : 'block', left: globalLeft }}
                />
                <div className="bb-pgrid__row bb-pgrid__row--ruler" role="group" aria-label="Playback timeline">
                  <div
                    className="bb-pgrid__track bb-pgrid__track--ruler"
                    data-range-mode={loopRange && loopEnabled ? 'loop' : pendingStart ? 'pending-start' : 'off'}
                    onLostPointerCapture={onRulerPointerCancel}
                    onPointerCancel={onRulerPointerCancel}
                    onPointerDown={(event) => beginTimelineDrag(event, 'new')}
                    onPointerMove={onRulerPointerMove}
                    onPointerUp={onRulerPointerUp}
                    ref={rulerTrackRef}
                    title={'Click: set playback start · Drag: set loop range (turns Loop on)\nAlt: snap to steps'}
                  >
                    {shownLoop ? (
                      <div
                        className={`bb-pgrid__ruler-loop${shownLoopInactive ? ' bb-pgrid__ruler-loop--inactive' : ''}`}
                        style={{
                          left: `${stepPct(shownLoop.startStep, globalEventTotal)}%`,
                          width: `${stepPct(shownLoop.endStep - shownLoop.startStep, globalEventTotal)}%`,
                        }}
                        title={shownLoopInactive
                          ? `Loop ${stepLabel(shownLoop.startStep)} – ${stepLabel(shownLoop.endStep - 1)} (off — turn Loop on to repeat it)`
                          : `Loop ${stepLabel(shownLoop.startStep)} – ${stepLabel(shownLoop.endStep - 1)}`}
                      >
                        <span
                          aria-label="Loop start handle"
                          className="bb-pgrid__loop-handle bb-pgrid__loop-handle--start"
                          onPointerDown={(event) => beginTimelineDrag(event, 'loop-start')}
                          role="separator"
                          title="Drag to move loop start"
                        />
                        <span
                          aria-label="Loop end handle"
                          className="bb-pgrid__loop-handle bb-pgrid__loop-handle--end"
                          onPointerDown={(event) => beginTimelineDrag(event, 'loop-end')}
                          role="separator"
                          title="Drag to move loop end"
                        />
                      </div>
                    ) : null}
                    {showStartMarker ? (
                      <span
                        aria-label={`Pending start at ${stepLabel(shownStart as number)}`}
                        className="bb-pgrid__start-flag"
                        onPointerDown={(event) => beginTimelineDrag(event, 'start')}
                        role="separator"
                        style={{ left: `${stepPct(shownStart as number, globalEventTotal)}%` }}
                        title={`Pending start (${stepLabel(shownStart as number)}) — drag to move`}
                      />
                    ) : null}
                  </div>
                </div>
                {showSectionLane ? (
                  <div className="bb-pgrid__row bb-pgrid__row--sections" role="group" aria-label="Sequence sections">
                    <div className="bb-pgrid__track bb-pgrid__track--sections" ref={firstTrackRef}>
                      {sectionLane.blocks.map((block) => {
                        const displayUnits = block.endStep - block.startStep;
                        const flexBasis = `${(displayUnits / Math.max(1, globalEventTotal)) * 100}%`;
                        const sliceRequest: ArrangementSlicePlayRequest = {
                          channelId: block.channelId,
                          startStep: block.startStep,
                          endStep: block.endStep,
                          seqName: block.seqName,
                          patName: block.patName,
                          channelItemIndex: block.channelItemIndex,
                          repeatIndex: block.repeatIndex,
                        };
                        const inSlice = sectionFocus
                          ? segmentMatchesSectionFocus(
                            {
                              channelItemIndex: block.channelItemIndex,
                              repeatIndex: block.repeatIndex,
                              startStep: block.startStep,
                              endStep: block.endStep,
                            },
                            sectionFocus,
                          )
                          : !!sliceWindow
                            && block.startStep < sliceWindow.endStep
                            && sliceWindow.startStep < block.endStep;
                        const chipLabel = abbreviatePatternName(block.label, 11);
                        const compact = displayUnits * pxPerStep < COMPACT_LABEL_PX;
                        return (
                          <div
                            key={block.key}
                            className={[
                              'bb-pgrid__section-block',
                              inSlice ? 'bb-pgrid__section-block--focus' : '',
                              compact ? 'bb-pgrid__section-block--compact' : '',
                            ].filter(Boolean).join(' ')}
                            style={{ flex: `0 0 ${flexBasis}` }}
                            title={`${block.label}\nClick: focus section · ▶: play section`}
                          >
                            <button
                              aria-label={`Play sequence section ${block.label}`}
                              className="bb-pgrid__section-play"
                              onClick={(event) => {
                                event.stopPropagation();
                                onPlaySliceRef.current?.({ ...sliceRequest, autoPlay: true });
                              }}
                              title={`Play ${block.label}`}
                              type="button"
                            >
                              ▶
                            </button>
                            <button
                              aria-label={`Focus sequence section ${block.label}`}
                              className="bb-pgrid__section-label"
                              onClick={() => {
                                onPlaySliceRef.current?.({ ...sliceRequest, autoPlay: false });
                              }}
                              title={`Focus ${block.label}`}
                              type="button"
                            >
                              {chipLabel}
                            </button>
                          </div>
                        );
                      })}
                      {sectionLane.tailEvents > 0 ? (
                        <div
                          className="bb-pgrid__block bb-pgrid__block--filler"
                          style={{ flex: `0 0 ${(sectionLane.tailEvents / Math.max(1, globalEventTotal)) * 100}%` }}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {rows.map((row, rowIndex) => {
                  const audible = isChannelAudible(channelInfo, row.channelId);
                  const tailEvents = globalEventTotal - row.displayTotal;
                  const patternToneByName = new Map<string, number>();
                  const toneLevels = [0.80, 0.64, 0.48, 0.32];
                  let stepCursor = 0;
                  return (
                    <div className="bb-pgrid__row" role="group" aria-label={`Channel ${row.channelId}`} key={row.channelId}>
                      <div
                        className="bb-pgrid__track"
                        ref={rowIndex === 0 && !showSectionLane ? firstTrackRef : undefined}
                        style={{ opacity: audible ? '1' : '0.4' }}
                      >
                        {row.segs.map((seg, index) => {
                          const displayUnits = Math.max(1, seg.count);
                          const startStep = stepCursor;
                          const endStep = stepCursor + Math.max(1, displayUnits);
                          stepCursor = endStep;
                          const flexBasis = `${(displayUnits / Math.max(1, globalEventTotal)) * 100}%`;
                          let tone = patternToneByName.get(seg.patName);
                          if (tone === undefined) {
                            tone = toneLevels[hashPatternName(seg.patName) % toneLevels.length];
                            patternToneByName.set(seg.patName, tone);
                          }
                          const blockLabel = seg.seqName ? `${seg.seqName} › ${seg.patName}` : seg.patName;
                          const chipLabel = abbreviatePatternName(seg.patName);
                          const inSlice = sectionFocus
                            ? segmentMatchesSectionFocus(
                              { channelItemIndex: seg.channelItemIndex, repeatIndex: seg.repeatIndex, startStep, endStep },
                              sectionFocus,
                            )
                            : !!sliceWindow
                              && startStep < sliceWindow.endStep
                              && sliceWindow.startStep < endStep;
                          const selected = selectedPatName === seg.patName;
                          const selectAndNavigate = () => {
                            const next = selectedPatName === seg.patName ? null : seg.patName;
                            selectedPatNameRef.current = next;
                            setSelectedPatName(next);
                            onNavigate?.(next);
                          };
                          const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              selectAndNavigate();
                            }
                          };
                          const compact = displayUnits <= 1 || displayUnits * pxPerStep < COMPACT_LABEL_PX;
                          return (
                            <div
                              aria-label={`Pattern block: ${blockLabel}. Click to highlight all uses and go to pattern.`}
                              aria-pressed={selected}
                              className={[
                                'bb-pgrid__block',
                                compact ? 'bb-pgrid__block--compact' : '',
                                inSlice ? 'bb-pgrid__block--slice' : '',
                                selected ? 'bb-pgrid__block--selected' : '',
                              ].filter(Boolean).join(' ')}
                              data-label={seg.patName}
                              data-start-step={startStep}
                              data-end-step={endStep}
                              key={`${row.channelId}-${seg.seqName ?? 'pat'}-${seg.patName}-${index}`}
                              onClick={() => selectAndNavigate()}
                              onKeyDown={onKeyDown}
                              role="button"
                              style={{
                                background: hexToRgba(row.color, tone),
                                borderColor: hexToRgba(row.color, Math.min(0.95, tone + 0.18)),
                                cursor: 'pointer',
                                flex: `0 0 ${flexBasis}`,
                              }}
                              tabIndex={0}
                              title={`${blockLabel}\nClick: highlight all “${seg.patName}” in the grid and editor · click again to clear`}
                            >
                              <span aria-hidden="true" className="bb-pgrid__block-label">{chipLabel}</span>
                            </div>
                          );
                        })}
                        {tailEvents > 0 ? (
                          <div
                            className="bb-pgrid__block bb-pgrid__block--filler"
                            style={{ flex: `0 0 ${(tailEvents / Math.max(1, globalEventTotal)) * 100}%` }}
                          />
                        ) : null}
                        <div
                          aria-hidden="true"
                          className={`bb-pgrid__cursor bb-pgrid__cursor--channel${paused ? ' bb-pgrid__cursor--paused' : ''}`}
                          style={{
                            display: positions[row.channelId] === undefined ? 'none' : 'block',
                            left: `${positions[row.channelId] ?? 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bb-pgrid__nav">
              {navReadout.position || navReadout.loop ? (
                <div className="bb-pgrid__nav-readout" aria-live="polite">
                  {navReadout.position ? (
                    <div className="bb-pgrid__nav-chip bb-pgrid__nav-chip--position" title="Playback start">
                      <span className="bb-pgrid__nav-chip-label">Position</span>
                      <span className="bb-pgrid__nav-chip-value">{navReadout.position.step}</span>
                      <span className="bb-pgrid__nav-chip-sep" aria-hidden="true" />
                      <span className="bb-pgrid__nav-chip-time">{navReadout.position.time}</span>
                    </div>
                  ) : null}
                  {navReadout.loop ? (
                    <div
                      className={`bb-pgrid__nav-chip bb-pgrid__nav-chip--loop${navReadout.loop.inactive ? ' bb-pgrid__nav-chip--inactive' : ''}`}
                      title={navReadout.loop.inactive ? 'Loop range (off)' : 'Loop range'}
                    >
                      <span className="bb-pgrid__nav-chip-label">Loop</span>
                      <span className="bb-pgrid__nav-chip-value">{navReadout.loop.steps}</span>
                      <span className="bb-pgrid__nav-chip-sep" aria-hidden="true" />
                      <span className="bb-pgrid__nav-chip-time">{navReadout.loop.time}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {needsHScroll ? (
                <div
                  aria-label="Pattern grid horizontal scroll"
                  className="bb-pgrid__hscroll"
                  onPointerDown={onHScrollTrackPointerDown}
                  ref={hscrollRef}
                  role="scrollbar"
                  aria-orientation="horizontal"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(maxScrollLeft)}
                  aria-valuenow={Math.round(scrollLeft)}
                >
                  <div
                    className="bb-pgrid__hscroll-thumb"
                    onPointerDown={onHScrollThumbPointerDown}
                    style={{ width: `${hScrollThumbWidth}px`, left: `${hScrollThumbLeft}px` }}
                  />
                </div>
              ) : (
                <div aria-hidden="true" className="bb-pgrid__nav-spacer" />
              )}
              <div className="bb-pgrid__zoom-actions" role="toolbar" aria-label="Pattern grid zoom">
                <button
                  aria-label="Zoom out"
                  className="bb-pgrid__btn bb-pgrid__btn--zoom"
                  onClick={() => applyZoom('manual', steppedPxPerStep(pxPerStep, 'out'))}
                  title="Zoom out"
                  type="button"
                >
                  −
                </button>
                <button
                  aria-label="Auto zoom — readable scale from panel width; scrolls when the song is longer"
                  aria-pressed={zoomMode === 'auto'}
                  className={`bb-pgrid__btn bb-pgrid__btn--zoom${zoomMode === 'auto' ? ' bb-pgrid__btn--active' : ''}`}
                  onClick={() => applyZoom('auto')}
                  title={"Auto — keep a readable block size based on panel width.\nLonger songs scroll horizontally instead of shrinking past a readable minimum."}
                  type="button"
                >
                  Auto
                </button>
                <button
                  aria-label="Zoom to fit — shrink the whole song into the panel width"
                  aria-pressed={zoomMode === 'fit'}
                  className={`bb-pgrid__btn bb-pgrid__btn--zoom${zoomMode === 'fit' ? ' bb-pgrid__btn--active' : ''}`}
                  onClick={() => applyZoom('fit')}
                  title={"Fit — show the whole song in the panel width.\nBlocks may shrink below the readable minimum so nothing scrolls off-screen."}
                  type="button"
                >
                  Fit
                </button>
                <button
                  aria-label="Zoom in"
                  className="bb-pgrid__btn bb-pgrid__btn--zoom"
                  onClick={() => applyZoom('manual', steppedPxPerStep(pxPerStep, 'in'))}
                  title="Zoom in"
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function createDesktopPatternGrid(
  container: HTMLElement,
  options: {
    /** Pattern selection changed: name to highlight in the editor, or `null` when cleared. */
  onNavigate?: (patName: string | null) => void;
    onPlaySlice?: (request: ArrangementSlicePlayRequest) => void;
    onPickStart?: (startStep: number) => void;
    onPickLoop?: (loop: LoopRange, enableLoop: boolean) => void;
  } = {},
): DesktopPatternGridHandle {
  const handleRef = { current: null as DesktopPatternGridHandle | null };
  const pendingCalls: Array<(handle: DesktopPatternGridHandle) => void> = [];
  let root: Root | null = mountReactRoot(container);

  const flushPending = (handle: DesktopPatternGridHandle) => {
    for (const fn of pendingCalls) fn(handle);
    pendingCalls.length = 0;
  };

  const assignGridRef = (handle: DesktopPatternGridHandle | null): void => {
    handleRef.current = handle;
    if (handle === null) return;
    flushPending(handle);
  };

  root.render(
    <DesktopPatternGrid
      gridRef={assignGridRef}
      onNavigate={options.onNavigate}
      onPlaySlice={options.onPlaySlice}
      onPickStart={options.onPickStart}
      onPickLoop={options.onPickLoop}
    />,
  );

  const call = (fn: (handle: DesktopPatternGridHandle) => void) => {
    if (handleRef.current) fn(handleRef.current);
    else pendingCalls.push(fn);
  };

  return {
    setSong: (song, ast, source) => call((handle) => handle.setSong(song, ast, source)),
    setPosition: (channelId, progress) => call((handle) => handle.setPosition(channelId, progress)),
    setGlobalProgress: (progress) => call((handle) => handle.setGlobalProgress(progress)),
    pausePositions: () => call((handle) => handle.pausePositions()),
    resumePositions: () => call((handle) => handle.resumePositions()),
    clearPositions: () => call((handle) => handle.clearPositions()),
    setSliceHighlight: (window) => call((handle) => handle.setSliceHighlight(window)),
    setSlicePlaybackRemap: (remap) => call((handle) => handle.setSlicePlaybackRemap(remap)),
    setSectionFocus: (info) => call((handle) => handle.setSectionFocus(info)),
    clearPatternSelection: () => call((handle) => handle.clearPatternSelection()),
    dispose: () => {
      handleRef.current?.dispose();
      unmountReactRoot(container, root);
      root = null;
    },
  };
}
