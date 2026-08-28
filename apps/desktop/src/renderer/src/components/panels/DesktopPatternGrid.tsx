import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
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
import type { SectionFocusInfo } from '@beatbax/app-core/editor/arrangement-slice';
import { getChannelColor } from '@beatbax/ui-tokens/channel-meta';
import { mountReactRoot, unmountReactRoot } from '../../utils/react-root';

interface Segment {
  patName: string;
  seqName: string | null;
  count: number;
}

interface RowBuildData {
  ch: any;
  segs: Segment[];
  displayTotal: number;
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
  loop?: boolean;
  /** When false, enter focus without starting playback (use transport Play). */
  autoPlay?: boolean;
}

interface DesktopPatternGridProps {
  gridRef: RefCallback<DesktopPatternGridHandle>;
  onNavigate?: (patName: string) => void;
  onPlaySlice?: (request: ArrangementSlicePlayRequest) => void;
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

interface SectionBlock {
  key: string;
  seqName: string | null;
  label: string;
  startStep: number;
  endStep: number;
  channelId: number;
  patName: string;
}

function sectionGroupKey(seg: Segment): string {
  return seg.seqName ? `seq:${seg.seqName}` : `pat:${seg.patName}`;
}

/** Collapse channel segments into sequence-level blocks for the section strip. */
function buildSectionBlocks(
  row: PatternGridRow,
  pats: Record<string, string[]>,
  patternDurations: Record<string, number>,
): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  let stepCursor = 0;
  let current: SectionBlock | null = null;

  for (const seg of row.segs) {
    const displayUnits = getSegmentDisplayUnits(seg, pats, patternDurations);
    const startStep = stepCursor;
    const endStep = stepCursor + Math.max(1, displayUnits);
    stepCursor = endStep;

    const key = sectionGroupKey(seg);
    if (current && current.key === key) {
      current.endStep = endStep;
      continue;
    }

    if (current) blocks.push(current);
    current = {
      key,
      seqName: seg.seqName,
      label: seg.seqName ?? seg.patName,
      startStep,
      endStep,
      channelId: row.channelId,
      patName: seg.patName,
    };
  }

  if (current) blocks.push(current);
  return blocks;
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

function channelPositionsAtPct(
  rows: PatternGridRow[],
  pct: number,
): Record<number, number> {
  return Object.fromEntries(rows.map((row) => [row.channelId, pct]));
}

function parseRepeatSpec(token: string): { base: string; repeat: number } {
  const t = token.trim();
  const rep = t.match(/^(.+?)\s*\*\s*(\d+)$/);
  if (!rep) return { base: t, repeat: 1 };
  const repeat = Math.max(1, parseInt(rep[2], 10) || 1);
  return { base: rep[1].trim(), repeat };
}

function tokenToPatternName(token: string): string {
  const t = token.trim();
  if (!t) return '';
  const { base } = parseRepeatSpec(t);
  return base.split(':')[0].trim();
}

function buildSegmentsFromEvents(events: any[]): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  for (const ev of events) {
    const prevPat: string = cur ? cur.patName : '?';
    const prevSeq: string | null = cur ? cur.seqName : null;
    const pat: string = ev.sourcePattern ?? prevPat;
    const seq: string | null = ev.sourceSequence ?? prevSeq;
    if (!cur || pat !== cur.patName || seq !== cur.seqName) {
      cur = { patName: pat, seqName: seq, count: 1 };
      segs.push(cur);
    } else {
      cur.count++;
    }
  }
  return segs;
}

function tokenConsumesStep(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  return !/^inst(?:\s|\()/i.test(t);
}

function tokenStepDuration(token: string): number {
  if (!tokenConsumesStep(token)) return 0;
  const match = token.trim().match(/:(\d+)(?:\s*)$/);
  return match ? Math.max(1, parseInt(match[1], 10) || 1) : 1;
}

function patternEventStepDuration(event: any): number {
  const kind = String(event?.kind ?? '');
  if (kind === 'inline-inst' || kind === 'temp-inst') return 0;
  const raw = typeof event?.raw === 'string' ? event.raw : typeof event?.value === 'string' ? event.value : '';
  if (raw && !tokenConsumesStep(raw)) return 0;
  return Math.max(1, Number(event?.duration) || 1);
}

function buildPatternDurations(ast: any, pats: Record<string, string[]>): Record<string, number> {
  const durations: Record<string, number> = {};
  const patternEvents: Record<string, any[]> | undefined = ast?.patternEvents;

  for (const [name, tokens] of Object.entries(pats)) {
    const events = patternEvents?.[name];
    if (Array.isArray(events) && events.length > 0) {
      durations[name] = Math.max(1, events.reduce((acc, event) => acc + patternEventStepDuration(event), 0));
      continue;
    }
    durations[name] = Math.max(1, tokens.reduce((acc, token) => acc + tokenStepDuration(String(token)), 0));
  }

  return durations;
}

function getPatternDuration(
  patName: string,
  patternDurations: Record<string, number>,
  pats: Record<string, string[]>,
): number {
  return patternDurations[patName] ?? Math.max(1, pats[patName]?.length ?? 1);
}

function splitRepeatedPatternRuns(
  segs: Segment[],
  pats: Record<string, string[]>,
  patternDurations: Record<string, number>,
): Segment[] {
  const out: Segment[] = [];
  for (const seg of segs) {
    const patLen = getPatternDuration(seg.patName, patternDurations, pats);
    const shouldSplit = patLen > 0 && seg.count > patLen && seg.count % patLen === 0;
    if (!shouldSplit) {
      out.push(seg);
      continue;
    }
    const repeats = seg.count / patLen;
    for (let i = 0; i < repeats; i++) {
      out.push({ ...seg, count: patLen });
    }
  }
  return out;
}

function getAstChannelSpecTokens(astChannel: any): string[] {
  const seqSpec: string[] | undefined = astChannel?.seqSpecTokens;
  if (Array.isArray(seqSpec) && seqSpec.length > 0) {
    return seqSpec.map((s) => String(s)).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof astChannel?.seq === 'string' && astChannel.seq.trim()) {
    return astChannel.seq.split(/\s*,\s*|\s+/).map((s: string) => s.trim()).filter(Boolean);
  }
  if (typeof astChannel?.pat === 'string' && astChannel.pat.trim()) {
    return astChannel.pat.split(/\s*,\s*|\s+/).map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}

function expandRefToPatternSegments(
  refToken: string,
  astSeqs: Record<string, any>,
  pats: Record<string, string[]>,
  rootSeqName: string | null,
  out: Segment[],
  visiting: Set<string>,
): void {
  const { base, repeat } = parseRepeatSpec(refToken);
  const refName = tokenToPatternName(base);
  if (!refName) return;

  const seqItems = astSeqs?.[refName];
  if (Array.isArray(seqItems)) {
    if (visiting.has(refName)) return;
    visiting.add(refName);
    for (let r = 0; r < repeat; r++) {
      for (const item of seqItems) {
        const inner = typeof item === 'string'
          ? item
          : String(item?.raw ?? item?.name ?? item?.pattern ?? item?.ref ?? '');
        if (!inner.trim()) continue;
        const itemRepeat = typeof item === 'object' && item !== null
          ? Math.max(1, Number(item.repeat) || 1)
          : 1;
        for (let ir = 0; ir < itemRepeat; ir++) {
          expandRefToPatternSegments(inner, astSeqs, pats, rootSeqName ?? refName, out, visiting);
        }
      }
    }
    visiting.delete(refName);
    return;
  }

  const patLen = Array.isArray(pats[refName]) ? pats[refName].length : 1;
  for (let r = 0; r < repeat; r++) {
    out.push({ patName: refName, seqName: rootSeqName, count: Math.max(1, patLen) });
  }
}

function buildSegmentsFromAstChannel(astChannel: any, ast: any, pats: Record<string, string[]>): Segment[] {
  const tokens = getAstChannelSpecTokens(astChannel);
  if (tokens.length === 0) return [];

  const segs: Segment[] = [];
  const astSeqs: Record<string, any> = ast?.seqs ?? {};
  for (const token of tokens) {
    const refName = tokenToPatternName(token);
    const rootSeqName = Array.isArray(astSeqs[refName]) ? refName : null;
    expandRefToPatternSegments(token, astSeqs, pats, rootSeqName, segs, new Set<string>());
  }
  return segs;
}

function getSegmentDisplayUnits(
  seg: Segment,
  pats: Record<string, string[]>,
  patternDurations: Record<string, number>,
): number {
  return getPatternDuration(seg.patName, patternDurations, pats) || seg.count;
}

function buildRows(song: any, ast?: any): {
  rows: PatternGridRow[];
  globalEventTotal: number;
  pats: Record<string, string[]>;
  patternDurations: Record<string, number>;
} {
  const channels: any[] = song?.channels ?? [];
  const pats: Record<string, string[]> = song?.pats ?? {};
  const patternDurations = buildPatternDurations(ast, pats);
  if (channels.length === 0) return { rows: [], globalEventTotal: 1, pats, patternDurations };

  const rowData: RowBuildData[] = channels.map((ch) => {
    const events: any[] = ch.events ?? [];
    const astChannel = (ast?.channels ?? []).find((c: any) => (c?.id ?? 0) === (ch?.id ?? 0));
    const astSegs = astChannel ? buildSegmentsFromAstChannel(astChannel, ast, pats) : [];
    const segs = splitRepeatedPatternRuns(astSegs.length > 0 ? astSegs : buildSegmentsFromEvents(events), pats, patternDurations);
    const displayTotal = Math.max(1, segs.reduce((acc, seg) => acc + getSegmentDisplayUnits(seg, pats, patternDurations), 0));
    return { ch, segs, displayTotal };
  });

  const globalEventTotal = Math.max(1, ...rowData.map((row) => row.displayTotal));
  const chip: string = song?.chip ?? 'gameboy';
  return {
    pats,
    patternDurations,
    globalEventTotal,
    rows: rowData.map((row) => ({
      channelId: row.ch?.id ?? 0,
      color: getChannelColor(chip, row.ch?.id ?? 0),
      segs: row.segs,
      displayTotal: row.displayTotal,
    })),
  };
}

interface ContextMenuState {
  x: number;
  y: number;
  request: ArrangementSlicePlayRequest;
}

function DesktopPatternGrid({
  gridRef,
  onNavigate,
  onPlaySlice,
}: DesktopPatternGridProps): React.JSX.Element {
  const [rows, setRows] = useState<PatternGridRow[]>([]);
  const [pats, setPats] = useState<Record<string, string[]>>({});
  const [patternDurations, setPatternDurations] = useState<Record<string, number>>({});
  const [globalEventTotal, setGlobalEventTotal] = useState(1);
  const [positions, setPositions] = useState<Record<number, number>>({});
  const [globalPct, setGlobalPct] = useState<number | null>(null);
  const [globalLeft, setGlobalLeft] = useState<string>('0%');
  const [paused, setPaused] = useState(false);
  const [channelInfo, setChannelInfo] = useState<Record<number, ChannelInfo>>(channelStates.get());
  const [sliceWindow, setSliceWindow] = useState<{ startStep: number; endStep: number } | null>(null);
  const [sectionFocus, setSectionFocusState] = useState<SectionFocusInfo | null>(null);
  const sectionFocusRef = useRef<SectionFocusInfo | null>(null);
  const globalEventTotalRef = useRef(1);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const rowsWrapRef = useRef<HTMLDivElement | null>(null);
  const firstTrackRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<PatternGridRow[]>([]);
  const onPlaySliceRef = useRef(onPlaySlice);
  onPlaySliceRef.current = onPlaySlice;

  useEffect(() => channelStates.subscribe((states) => {
    setChannelInfo({ ...states });
  }), []);

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

  useLayoutEffect(() => {
    updateGlobalLeft(globalPct);
  }, [globalPct, rows, updateGlobalLeft]);

  useEffect(() => {
    const onResize = () => updateGlobalLeft(globalPct);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [globalPct, updateGlobalLeft]);

  useEffect(() => {
    const rowsWrap = rowsWrapRef.current;
    const firstTrack = firstTrackRef.current;
    if (!rowsWrap || !firstTrack || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => updateGlobalLeft(globalPct));
    observer.observe(rowsWrap);
    observer.observe(firstTrack);
    return () => observer.disconnect();
  }, [globalPct, rows, updateGlobalLeft]);

  useImperativeHandle(gridRef, () => ({
    setSong: (song, ast) => {
      const next = buildRows(song, ast);
      setRows(next.rows);
      setPats(next.pats);
      setPatternDurations(next.patternDurations);
      globalEventTotalRef.current = next.globalEventTotal;
      setGlobalEventTotal(next.globalEventTotal);
      setPositions({});
      setGlobalPct(null);
      setPaused(false);
      setSliceWindow(null);
    },
    setPosition: (channelId, progress) => {
      const mapped = mapProgressIntoWindow(
        progress,
        sectionFocusRef.current?.window,
        globalEventTotalRef.current,
      );
      const pct = Math.min(99.5, Math.max(0, mapped * 100));
      setPositions((current) => ({ ...current, [channelId]: pct }));
      setPaused(false);
    },
    setGlobalProgress: (progress) => {
      const mapped = mapProgressIntoWindow(
        progress,
        sectionFocusRef.current?.window,
        globalEventTotalRef.current,
      );
      const pct = Math.min(99.5, Math.max(0, mapped * 100));
      setGlobalPct(pct);
      setPaused(false);
    },
    pausePositions: () => setPaused(true),
    resumePositions: () => setPaused(false),
    clearPositions: () => {
      const startPct = sectionWindowStartPct(
        sectionFocusRef.current?.window,
        globalEventTotalRef.current,
      ) ?? 0;
      setPositions(channelPositionsAtPct(rowsRef.current, startPct));
      setGlobalPct(startPct);
      setPaused(false);
    },
    setSliceHighlight: (window) => setSliceWindow(window),
    setSectionFocus: (info) => {
      const prevWindow = sectionFocusRef.current?.window;
      sectionFocusRef.current = info;
      setSectionFocusState(info);
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
      setPositions({});
      setGlobalPct(null);
      setSliceWindow(null);
      setSectionFocusState(null);
      setContextMenu(null);
    },
  }), []);

  const empty = rows.length === 0;

  const sectionLane = useMemo(() => {
    if (rows.length === 0) return { blocks: [] as SectionBlock[], tailEvents: 0, displayTotal: 0 };
    const refRow = rows.find((row) => row.segs.some((seg) => seg.seqName)) ?? rows[0];
    return {
      blocks: buildSectionBlocks(refRow, pats, patternDurations),
      tailEvents: globalEventTotal - refRow.displayTotal,
      displayTotal: refRow.displayTotal,
    };
  }, [rows, pats, patternDurations, globalEventTotal]);

  const showSectionLane = sectionLane.blocks.length > 0 && !!onPlaySlice;

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
          <div
            aria-hidden="true"
            className={`bb-pgrid__cursor bb-pgrid__cursor--global${paused ? ' bb-pgrid__cursor--paused' : ''}`}
            style={{ display: globalPct === null ? 'none' : 'block', left: globalLeft }}
          />
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
                  };
                  const inSlice = !!sliceWindow
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
                    const displayUnits = getSegmentDisplayUnits(seg, pats, patternDurations);
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
                    const inSlice = !!sliceWindow
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
                        onContextMenu={(event) => {
                          event.preventDefault();
                          onNavigate?.(seg.patName);
                        }}
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
      {contextMenu ? (
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
    setSectionFocus: (info) => call((handle) => handle.setSectionFocus(info)),
    dispose: () => {
      handleRef.current?.dispose();
      unmountReactRoot(container, root);
      root = null;
    },
  };
}
