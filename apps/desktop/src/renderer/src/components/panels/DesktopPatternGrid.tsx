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
import { collectStepBoundaries, snapLoopRange, snapStepDown, type LoopRange } from '@beatbax/app-core/playback/playback-range';
import { playbackStatus } from '@beatbax/app-core/stores/playback.store';
import {
  clearPlaybackLoopRange,
  playbackLoopRange,
  playbackStartStep,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';
import { getChannelColor } from '@beatbax/ui-tokens/channel-meta';
import { mountReactRoot, unmountReactRoot } from '../../utils/react-root';
import {
  idlePlayheadStep,
  resolveTimelineGesture,
  rowStepSpans,
  stepFromClientX,
  type TimelineDragKind,
} from '../../lib/pattern-grid-timeline';

interface Segment {
  patName: string;
  seqName: string | null;
  channelItemIndex: number | null;
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
  loop?: boolean;
  /** When false, enter focus without starting playback (use transport Play). */
  autoPlay?: boolean;
}

interface DesktopPatternGridProps {
  gridRef: RefCallback<DesktopPatternGridHandle>;
  onNavigate?: (patName: string) => void;
  onPlaySlice?: (request: ArrangementSlicePlayRequest) => void;
  /** Called before the timeline ruler changes the pending start or loop range. */
  onTimelineEdit?: () => void;
}

export interface DesktopPatternGridHandle {
  setSong: (song: unknown, ast?: unknown) => void;
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

function sectionWindowRect(
  window: { startStep: number; endStep: number } | null | undefined,
  globalEventTotal: number,
  rowsWrap: HTMLElement | null,
  firstTrack: HTMLElement | null,
): { left: string; width: string } | null {
  if (!window || globalEventTotal <= 0) return null;
  const startPct = window.startStep / globalEventTotal;
  const widthPct = (window.endStep - window.startStep) / globalEventTotal;
  if (widthPct <= 0) return null;

  if (!rowsWrap || !firstTrack) {
    return {
      left: `${startPct * 100}%`,
      width: `${widthPct * 100}%`,
    };
  }

  const wrapRect = rowsWrap.getBoundingClientRect();
  const trackRect = firstTrack.getBoundingClientRect();
  if (wrapRect.width <= 0 || trackRect.width <= 0) {
    return {
      left: `${startPct * 100}%`,
      width: `${widthPct * 100}%`,
    };
  }

  const trackLeft = trackRect.left - wrapRect.left;
  return {
    left: `${trackLeft + trackRect.width * startPct}px`,
    width: `${trackRect.width * widthPct}px`,
  };
}

/** Horizontal offset of a global step inside the rows wrapper (matches the global playhead). */
function stepOffsetLeft(
  step: number,
  globalEventTotal: number,
  rowsWrap: HTMLElement | null,
  firstTrack: HTMLElement | null,
): string {
  const pct = globalEventTotal > 0 ? Math.min(1, Math.max(0, step / globalEventTotal)) : 0;
  if (!rowsWrap || !firstTrack) return `${pct * 100}%`;
  const wrapRect = rowsWrap.getBoundingClientRect();
  const trackRect = firstTrack.getBoundingClientRect();
  if (wrapRect.width <= 0 || trackRect.width <= 0) return `${pct * 100}%`;
  return `${trackRect.left - wrapRect.left + trackRect.width * pct}px`;
}

function channelPositionsAtPct(
  rows: PatternGridRow[],
  pct: number,
): Record<number, number> {
  return Object.fromEntries(rows.map((row) => [row.channelId, pct]));
}

function buildRows(song: any, ast?: any): {
  rows: PatternGridRow[];
  globalEventTotal: number;
  sectionBlocks: ArrangementSectionBlock[];
} {
  const channels: any[] = song?.channels ?? [];
  if (channels.length === 0) {
    return { rows: [], globalEventTotal: 1, sectionBlocks: [] };
  }

  const timelines = buildChannelTimelines('', song, ast);
  const rowData = timelines.map((timeline) => {
    const segs: Segment[] = timeline.segments.map((s) => ({
      patName: s.patName,
      seqName: s.seqName,
      channelItemIndex: s.channelItemIndex,
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
    sectionBlocks: listArrangementSections('', song, ast),
    rows: rowData.map((row) => ({
      channelId: row.ch?.id ?? 0,
      color: getChannelColor(chip, row.ch?.id ?? 0),
      segs: row.segs,
      displayTotal: row.displayTotal,
    })),
  };
}

type ContextMenuState =
  | { kind: 'section'; x: number; y: number; request: ArrangementSlicePlayRequest }
  | { kind: 'timeline'; x: number; y: number; step: number };

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
  onTimelineEdit,
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const rowsWrapRef = useRef<HTMLDivElement | null>(null);
  const firstTrackRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<PatternGridRow[]>([]);
  const onPlaySliceRef = useRef(onPlaySlice);
  onPlaySliceRef.current = onPlaySlice;
  const onTimelineEditRef = useRef(onTimelineEdit);
  useEffect(() => {
    onTimelineEditRef.current = onTimelineEdit;
  }, [onTimelineEdit]);
  const [pendingStart, setPendingStart] = useState<number | null>(playbackStartStep.get());
  const [loopRange, setLoopRangeState] = useState<LoopRange | null>(playbackLoopRange.get());
  const [dragPreview, setDragPreview] = useState<{ start?: number; loop?: LoopRange | null } | null>(null);
  const [rangeOverlay, setRangeOverlay] = useState<{
    loopRect: { left: string; width: string } | null;
    startLeft: string | null;
  }>({ loopRect: null, startLeft: null });
  const rangeShownRef = useRef<{ loop: LoopRange | null; start: number | null }>({ loop: null, start: null });
  const rulerTrackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<TimelineDrag | null>(null);

  useEffect(() => channelStates.subscribe((states) => {
    setChannelInfo({ ...states });
  }), []);

  useEffect(() => playbackStartStep.subscribe((step) => setPendingStart(step)), []);
  useEffect(() => playbackLoopRange.subscribe((range) => setLoopRangeState(range)), []);

  const stepBoundaries = useMemo(
    () => collectStepBoundaries(rows.map((row) => rowStepSpans(row.segs.map((seg) => seg.count))), globalEventTotal),
    [rows, globalEventTotal],
  );

  const showIdlePlayhead = useCallback((): void => {
    const step = idlePlayheadStep({
      focusWindow: sectionFocusRef.current?.window,
      loop: playbackLoopRange.get(),
      startStep: playbackStartStep.get(),
    });
    const pct = Math.min(99.5, stepPct(step, globalEventTotalRef.current));
    setPositions(channelPositionsAtPct(rowsRef.current, pct));
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
  }, [pendingStart, loopRange, showIdlePlayhead]);

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
    const result = resolveTimelineGesture(
      drag.kind, drag.anchorStep, rulerStepAt(event.clientX), true, stepBoundaries, playbackLoopRange.get(),
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
    const result = resolveTimelineGesture(
      drag.kind, drag.anchorStep, rulerStepAt(event.clientX), drag.moved, stepBoundaries, playbackLoopRange.get(),
    );
    if (result.kind === 'none') return;
    onTimelineEditRef.current?.();
    if (result.kind === 'start') setPlaybackStartStep(result.startStep);
    else setPlaybackLoopRange(result.loop);
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

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const updateGlobalLeft = useCallback((pct: number | null): void => {
    if (pct === null) return;
    const rowsWrap = rowsWrapRef.current;
    const firstTrack = firstTrackRef.current;
    if (!rowsWrap || !firstTrack) {
      setGlobalLeft(`${pct}%`);
      return;
    }
    const wrapRect = rowsWrap.getBoundingClientRect();
    const trackRect = firstTrack.getBoundingClientRect();
    if (wrapRect.width <= 0 || trackRect.width <= 0) {
      setGlobalLeft(`${pct}%`);
      return;
    }
    const x = trackRect.left - wrapRect.left + trackRect.width * (pct / 100);
    setGlobalLeft(`${x}px`);
  }, []);

  const updateFocusColumnRect = useCallback((): void => {
    const rect = sectionWindowRect(
      sectionFocusRef.current?.window,
      globalEventTotalRef.current,
      rowsWrapRef.current,
      firstTrackRef.current,
    );
    setFocusColumnRect(rect);
  }, []);

  useLayoutEffect(() => {
    updateGlobalLeft(globalPct);
    updateFocusColumnRect();
  }, [globalPct, rows, sectionFocus, updateGlobalLeft, updateFocusColumnRect]);

  const updateRangeOverlay = useCallback((): void => {
    const { loop, start } = rangeShownRef.current;
    const total = globalEventTotalRef.current;
    setRangeOverlay({
      loopRect: loop ? sectionWindowRect(loop, total, rowsWrapRef.current, firstTrackRef.current) : null,
      startLeft: start !== null ? stepOffsetLeft(start, total, rowsWrapRef.current, firstTrackRef.current) : null,
    });
  }, []);

  useEffect(() => {
    const onResize = () => {
      updateGlobalLeft(globalPct);
      updateFocusColumnRect();
      updateRangeOverlay();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [globalPct, updateGlobalLeft, updateFocusColumnRect, updateRangeOverlay]);

  useEffect(() => {
    const rowsWrap = rowsWrapRef.current;
    const firstTrack = firstTrackRef.current;
    if (!rowsWrap || !firstTrack || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      updateGlobalLeft(globalPct);
      updateFocusColumnRect();
      updateRangeOverlay();
    });
    observer.observe(rowsWrap);
    observer.observe(firstTrack);
    return () => observer.disconnect();
  }, [globalPct, rows, sectionFocus, updateGlobalLeft, updateFocusColumnRect, updateRangeOverlay]);

  useImperativeHandle(gridRef, () => ({
    setSong: (song, ast) => {
      const next = buildRows(song, ast);
      setRows(next.rows);
      setSectionBlocks(next.sectionBlocks);
      globalEventTotalRef.current = next.globalEventTotal;
      setGlobalEventTotal(next.globalEventTotal);
      setPositions({});
      setGlobalPct(null);
      setPaused(false);
      setSliceWindow(null);
      setSectionFocusState(null);
      sectionFocusRef.current = null;
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
    setSectionFocus: (info) => {
      const prevWindow = sectionFocusRef.current?.window;
      sectionFocusRef.current = info;
      setSectionFocusState(info);
      setFocusColumnRect(sectionWindowRect(
        info?.window,
        globalEventTotalRef.current,
        rowsWrapRef.current,
        firstTrackRef.current,
      ));
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
      setContextMenu(null);
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

  const shownLoop = dragPreview && 'loop' in dragPreview ? dragPreview.loop ?? null : loopRange;
  const shownStart = dragPreview && 'start' in dragPreview ? dragPreview.start ?? null : pendingStart;
  const showStartMarker = !shownLoop && shownStart !== null && shownStart > 0;

  useLayoutEffect(() => {
    rangeShownRef.current = { loop: shownLoop, start: showStartMarker ? shownStart : null };
    updateRangeOverlay();
  }, [shownLoop, shownStart, showStartMarker, rows, globalEventTotal, updateRangeOverlay]);

  const loopRect = shownLoop ? rangeOverlay.loopRect : null;
  const startMarkerLeft = showStartMarker ? rangeOverlay.startLeft : null;
  const stepLabel = (step: number): string => `step ${step + 1}`;

  return (
    <div
      className="bb-pgrid"
      role="region"
      aria-label="Pattern grid"
      data-empty={empty ? 'true' : undefined}
      data-section-focus={sectionFocus ? 'true' : undefined}
    >
      {empty ? null : (
        <div className="bb-pgrid__rows" ref={rowsWrapRef}>
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
              className={`bb-pgrid__loop-range${dragPreview ? ' bb-pgrid__loop-range--preview' : ''}`}
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
            <div className="bb-pgrid__controls bb-pgrid__controls--ruler">
              {loopRange ? (
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
              )}
            </div>
            <span aria-hidden="true" className="bb-pgrid__dot bb-pgrid__dot--spacer" />
            <div
              className="bb-pgrid__track bb-pgrid__track--ruler"
              data-range-mode={loopRange ? 'loop' : pendingStart ? 'pending-start' : 'off'}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ kind: 'timeline', x: event.clientX, y: event.clientY, step: rulerStepAt(event.clientX) });
              }}
              onLostPointerCapture={onRulerPointerCancel}
              onPointerCancel={onRulerPointerCancel}
              onPointerDown={(event) => beginTimelineDrag(event, 'new')}
              onPointerMove={onRulerPointerMove}
              onPointerUp={onRulerPointerUp}
              ref={rulerTrackRef}
              title={'Click: set playback start · Drag: set loop range\nRight-click: start / loop options'}
            >
              {shownLoop ? (
                <div
                  className="bb-pgrid__ruler-loop"
                  style={{
                    left: `${stepPct(shownLoop.startStep, globalEventTotal)}%`,
                    width: `${stepPct(shownLoop.endStep - shownLoop.startStep, globalEventTotal)}%`,
                  }}
                  title={`Loop ${stepLabel(shownLoop.startStep)} – ${stepLabel(shownLoop.endStep - 1)}`}
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
              <div aria-hidden="true" className="bb-pgrid__controls bb-pgrid__controls--section">
                <span className="bb-pgrid__section-heading">Seq</span>
              </div>
              <span aria-hidden="true" className="bb-pgrid__dot bb-pgrid__dot--spacer" />
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
                  };
                  const inSlice = sectionFocus
                    ? segmentMatchesSectionFocus(
                      { channelItemIndex: block.channelItemIndex, startStep: block.startStep, endStep: block.endStep },
                      sectionFocus,
                    )
                    : !!sliceWindow
                      && block.startStep < sliceWindow.endStep
                      && sliceWindow.startStep < block.endStep;
                  const chipLabel = abbreviatePatternName(block.label, 11);
                  return (
                    <div
                      key={block.key}
                      className={[
                        'bb-pgrid__section-block',
                        inSlice ? 'bb-pgrid__section-block--focus' : '',
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
                        onContextMenu={(event) => {
                          if (!onPlaySliceRef.current) return;
                          event.preventDefault();
                          setContextMenu({
                            kind: 'section',
                            x: event.clientX,
                            y: event.clientY,
                            request: sliceRequest,
                          });
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
            const info = channelInfo[row.channelId];
            const audible = isChannelAudible(channelInfo, row.channelId);
            const tailEvents = globalEventTotal - row.displayTotal;
            const patternToneByName = new Map<string, number>();
            const toneLevels = [0.80, 0.64, 0.48, 0.32];
            let stepCursor = 0;
            return (
              <div className="bb-pgrid__row" role="group" aria-label={`Channel ${row.channelId}`} key={row.channelId}>
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
                        { channelItemIndex: seg.channelItemIndex, startStep, endStep },
                        sectionFocus,
                      )
                      : !!sliceWindow
                        && startStep < sliceWindow.endStep
                        && sliceWindow.startStep < endStep;
                    const navigate = () => onNavigate?.(seg.patName);
                    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate();
                      }
                    };
                    return (
                      <div
                        aria-label={`Pattern block: ${blockLabel}. Click to go to pattern.`}
                        className={[
                          'bb-pgrid__block',
                          displayUnits <= 1 ? 'bb-pgrid__block--compact' : '',
                          inSlice ? 'bb-pgrid__block--slice' : '',
                        ].filter(Boolean).join(' ')}
                        data-label={seg.patName}
                        data-start-step={startStep}
                        data-end-step={endStep}
                        key={`${row.channelId}-${seg.seqName ?? 'pat'}-${seg.patName}-${index}`}
                        onClick={() => navigate()}
                        onKeyDown={onKeyDown}
                        role="button"
                        style={{
                          background: hexToRgba(row.color, tone),
                          borderColor: hexToRgba(row.color, Math.min(0.95, tone + 0.18)),
                          cursor: 'pointer',
                          flex: `0 0 ${flexBasis}`,
                        }}
                        tabIndex={0}
                        title={`${blockLabel}\nClick: go to pattern`}
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
      )}
      {contextMenu?.kind === 'timeline' ? (
        <div
          className="bb-pgrid__menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onTimelineEditRef.current?.();
              setPlaybackStartStep(snapStepDown(contextMenu.step, stepBoundaries));
              setContextMenu(null);
            }}
          >
            Set start here
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              const loop = snapLoopRange(contextMenu.step, contextMenu.step, stepBoundaries);
              if (loop) {
                onTimelineEditRef.current?.();
                setPlaybackLoopRange(loop);
              }
              setContextMenu(null);
            }}
          >
            Loop this block
          </button>
          <button
            disabled={pendingStart === null}
            role="menuitem"
            type="button"
            onClick={() => {
              setPlaybackStartStep(null);
              setContextMenu(null);
            }}
          >
            Clear start marker
          </button>
          <button
            disabled={loopRange === null}
            role="menuitem"
            type="button"
            onClick={() => {
              clearPlaybackLoopRange();
              setContextMenu(null);
            }}
          >
            Clear loop range
          </button>
        </div>
      ) : null}
      {contextMenu?.kind === 'section' ? (
        <div
          className="bb-pgrid__menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onPlaySliceRef.current?.({ ...contextMenu.request, autoPlay: false });
              setContextMenu(null);
            }}
          >
            Focus section
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onPlaySliceRef.current?.({ ...contextMenu.request, autoPlay: true });
              setContextMenu(null);
            }}
          >
            Play section
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function createDesktopPatternGrid(
  container: HTMLElement,
  options: {
    onNavigate?: (patName: string) => void;
    onPlaySlice?: (request: ArrangementSlicePlayRequest) => void;
    onTimelineEdit?: () => void;
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
      onTimelineEdit={options.onTimelineEdit}
    />,
  );

  const call = (fn: (handle: DesktopPatternGridHandle) => void) => {
    if (handleRef.current) fn(handleRef.current);
    else pendingCalls.push(fn);
  };

  return {
    setSong: (song, ast) => call((handle) => handle.setSong(song, ast)),
    setPosition: (channelId, progress) => call((handle) => handle.setPosition(channelId, progress)),
    setGlobalProgress: (progress) => call((handle) => handle.setGlobalProgress(progress)),
    pausePositions: () => call((handle) => handle.pausePositions()),
    resumePositions: () => call((handle) => handle.resumePositions()),
    clearPositions: () => call((handle) => handle.clearPositions()),
    setSliceHighlight: (window) => call((handle) => handle.setSliceHighlight(window)),
    setSlicePlaybackRemap: (remap) => call((handle) => handle.setSlicePlaybackRemap(remap)),
    setSectionFocus: (info) => call((handle) => handle.setSectionFocus(info)),
    dispose: () => {
      handleRef.current?.dispose();
      unmountReactRoot(container, root);
      root = null;
    },
  };
}
