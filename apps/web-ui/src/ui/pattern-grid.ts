/**
 * PatternGrid — read-only horizontal sequence overview with timeline seek/loop (spec 014 / 097).
 *
 * Renders a `Pos` timeline ruler row above one compact row per channel. Each
 * channel row has M/S buttons, a coloured dot, and a flex strip of coloured
 * blocks (one per contiguous pattern section). A thin vertical cursor advances
 * through the strip during playback.
 *
 * Usage:
 *   const grid = new PatternGrid();
 *   container.appendChild(grid.el);
 *   grid.setSong(song);                                  // on parse:success (SongModel)
 *   grid.setPosition(channelId, position.progress);      // per-channel cursor
 *   grid.setGlobalProgress(playbackProgress);            // on playback:position
 *   grid.pausePositions();                               // on playback:paused
 *   grid.resumePositions();                              // on playback:resumed / started
 *   grid.clearPositions();                               // on playback:stopped
 *
 *   grid.onNavigate = (patName) => { /* jump editor cursor *\/ };
 *   grid.onPickStart = (startStep) => { /* seek / set pending start *\/ };
 *   grid.onPickLoop = (loop, enableLoop) => { /* set loop range *\/ };
 */

import { buildChannelTimelines } from '@beatbax/app-core/editor/arrangement-slice';
import {
  idlePlayheadStep,
  resolveTimelineGesture,
  rowStepSpans,
  stepFromClientX,
  type TimelineDragKind,
} from '@beatbax/app-core/playback/pattern-grid-timeline';
import { collectStepBoundaries, type LoopRange } from '@beatbax/app-core/playback/playback-range';
import { channelStates, toggleChannelMuted, toggleChannelSoloed, isChannelAudible } from '@beatbax/app-core/stores/channel.store';
import { playbackStatus } from '@beatbax/app-core/stores/playback.store';
import {
  clearPlaybackLoopRange,
  getActivePlaybackLoopRange,
  playbackLoopEnabled,
  playbackLoopRange,
  playbackStartStep,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';
import { getChannelColor } from '../utils/chip-meta';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

interface Segment {
  patName: string;
  seqName: string | null;
  count: number;
  startStep: number;
  endStep: number;
}

interface RowBuildData {
  ch: any;
  segs: Segment[];
  displayTotal: number;
}

function abbreviatePatternName(name: string, maxLen = 9): string {
  if (name.length <= maxLen) return name;
  const keepHead = Math.max(3, Math.floor((maxLen - 1) / 2));
  const keepTail = Math.max(2, maxLen - keepHead - 1);
  return `${name.slice(0, keepHead)}…${name.slice(-keepTail)}`;
}

function stepPct(step: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (step / total) * 100)) : 0;
}

function stepLabel(step: number): string {
  return `step ${step + 1}`;
}

interface RowMeta {
  track: HTMLElement;
  cursor: HTMLElement;
  muteBtn: HTMLButtonElement;
  soloBtn: HTMLButtonElement;
}

interface TimelineDrag {
  kind: TimelineDragKind;
  pointerId: number;
  anchorStep: number;
  originX: number;
  moved: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export class PatternGrid {
  readonly el: HTMLElement;

  /**
   * Called when a pattern block is clicked. Receives the `pat` name so the
   * caller can navigate the Monaco editor cursor to that definition.
   */
  onNavigate?: (patName: string) => void;

  /**
   * Called for Shift+click / play affordance — arrangement slice across channels.
   */
  onPlaySlice?: (request: {
    channelId: number;
    startStep: number;
    endStep: number;
    seqName: string | null;
    patName: string;
    loop?: boolean;
  }) => void;

  /** Ruler click or start-flag drop; owns setting the pending start and seeking playback. */
  onPickStart?: (startStep: number) => void;

  /** Ruler loop drag; owns setting the range, Loop (`enableLoop` for a new range) and seeking playback. */
  onPickLoop?: (loop: LoopRange, enableLoop: boolean) => void;

  private _rows             = new Map<number, RowMeta>();
  /** Max total events (note + rest) across all channels — used as block-width denominator. */
  private _globalEventTotal = 1;
  private _stepBoundaries: number[] = [0, 1];
  /** Single DAW-style playhead spanning the full grid. */
  private _globalCursor: HTMLElement | null = null;
  /** Wrapper around all rows; provides global cursor coordinate space. */
  private _rowsWrap: HTMLElement | null = null;
  /** Ruler DOM references. */
  private _rulerControls: HTMLElement | null = null;
  private _rulerTrack: HTMLElement | null = null;
  private _loopRangeOverlay: HTMLElement | null = null;
  private _startMarkerOverlay: HTMLElement | null = null;
  /** Active pointer drag on the ruler. */
  private _drag: TimelineDrag | null = null;
  private _dragPreview: { start?: number; loop?: LoopRange | null } | null = null;
  /** Last global cursor percentage. */
  private _globalPct = 0;
  /** Cached geometry for placing the global playhead without per-tick reflow reads. */
  private _globalCursorXOffset = 0;
  private _globalCursorTrackWidth = 0;
  private _globalCursorLayoutValid = false;
  /** Layout observers/listeners used to invalidate cached cursor geometry. */
  private _layoutObserver: ResizeObserver | null = null;
  private _onWindowResize = () => {
    this._invalidateGlobalCursorLayout();
    this._syncRangeDom();
    if (this._globalCursor && this._globalCursor.style.display !== 'none') {
      const paused = this._globalCursor.classList.contains('bb-pgrid__cursor--paused');
      this._setGlobalCursorPosition(this._globalPct);
      if (paused) this._globalCursor.classList.add('bb-pgrid__cursor--paused');
    }
  };
  /** Store subscriptions. */
  private _unsubs: Array<() => void> = [];

  constructor() {
    const el = document.createElement('div');
    el.className = 'bb-pgrid';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Pattern grid');
    el.dataset['empty'] = 'true';
    this.el = el;

    // Reactively update M/S button states when channel store changes
    this._unsubs.push(channelStates.subscribe(() => this._syncMuteSolo()));

    // Reactively update ruler/overlays and idle playhead when playback range changes
    const onRangeChange = () => {
      if (this._rows.size === 0) return;
      this._syncRangeDom();
      if (playbackStatus.get() === 'stopped') {
        this._showIdlePlayhead();
      }
    };
    this._unsubs.push(
      playbackStartStep.listen(onRangeChange),
      playbackLoopRange.listen(onRangeChange),
      playbackLoopEnabled.listen(onRangeChange),
    );

    // Recompute global cursor anchoring only when layout may have changed.
    window.addEventListener('resize', this._onWindowResize);
  }

  /** Rebuild the grid from a resolved SongModel (treated as `any` to avoid import deps). */
  setSong(song: any, ast?: any, fullSource = ''): void {
    this._teardownLayoutObserver();
    this.el.innerHTML = '';
    this._rows.clear();
    this._globalCursor = null;
    this._rowsWrap = null;
    this._rulerControls = null;
    this._rulerTrack = null;
    this._loopRangeOverlay = null;
    this._startMarkerOverlay = null;
    this._drag = null;
    this._dragPreview = null;
    this._globalPct = 0;
    this._stepBoundaries = [0, 1];
    this._invalidateGlobalCursorLayout();

    const channels: any[] = song?.channels ?? [];
    if (channels.length === 0) {
      this.el.dataset['empty'] = 'true';
      return;
    }
    delete this.el.dataset['empty'];

    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'bb-pgrid__rows';
    this._rowsWrap = rowsWrap;

    const loopRangeOverlay = document.createElement('div');
    loopRangeOverlay.className = 'bb-pgrid__loop-range';
    loopRangeOverlay.setAttribute('aria-hidden', 'true');
    loopRangeOverlay.style.display = 'none';
    rowsWrap.appendChild(loopRangeOverlay);
    this._loopRangeOverlay = loopRangeOverlay;

    const startMarkerOverlay = document.createElement('div');
    startMarkerOverlay.className = 'bb-pgrid__start-marker';
    startMarkerOverlay.setAttribute('aria-hidden', 'true');
    startMarkerOverlay.style.display = 'none';
    rowsWrap.appendChild(startMarkerOverlay);
    this._startMarkerOverlay = startMarkerOverlay;

    const globalCursor = document.createElement('div');
    globalCursor.className = 'bb-pgrid__cursor bb-pgrid__cursor--global';
    globalCursor.setAttribute('aria-hidden', 'true');
    globalCursor.style.display = 'none';
    rowsWrap.appendChild(globalCursor);
    this._globalCursor = globalCursor;

    const timelines = buildChannelTimelines(fullSource, song, ast);
    const rowData: RowBuildData[] = timelines.map((timeline) => {
      const ch = channels.find((c) => (c?.id ?? 0) === timeline.channelId) ?? { id: timeline.channelId };
      const segs: Segment[] = timeline.segments.map((s) => ({
        patName: s.patName,
        seqName: s.seqName,
        count: Math.max(1, s.endStep - s.startStep),
        startStep: s.startStep,
        endStep: s.endStep,
      }));
      const displayTotal = Math.max(1, segs.reduce((acc, seg) => acc + seg.count, 0));
      return { ch, segs, displayTotal };
    });

    // ── First pass: compute global totals for cross-channel alignment ────────
    let maxUnits = 1;
    for (const row of rowData) {
      if (row.displayTotal > maxUnits) maxUnits = row.displayTotal;
    }
    this._globalEventTotal = maxUnits;
    this._stepBoundaries = collectStepBoundaries(
      rowData.map((row) => rowStepSpans(row.segs.map((seg) => seg.count))),
      this._globalEventTotal,
    );

    // ── Ruler row (`Pos`) ─────────────────────────────────────────────────────
    const rulerRow = document.createElement('div');
    rulerRow.className = 'bb-pgrid__row bb-pgrid__row--ruler';
    rulerRow.setAttribute('role', 'group');
    rulerRow.setAttribute('aria-label', 'Playback timeline');

    const rulerControls = document.createElement('div');
    rulerControls.className = 'bb-pgrid__controls bb-pgrid__controls--ruler';
    this._rulerControls = rulerControls;
    rulerRow.appendChild(rulerControls);

    const rulerDot = document.createElement('span');
    rulerDot.className = 'bb-pgrid__dot bb-pgrid__dot--spacer';
    rulerDot.setAttribute('aria-hidden', 'true');
    rulerRow.appendChild(rulerDot);

    const rulerTrack = document.createElement('div');
    rulerTrack.className = 'bb-pgrid__track bb-pgrid__track--ruler';
    rulerTrack.title = 'Click: set playback start · Drag: set loop range (turns Loop on)\nAlt: snap to steps';
    rulerTrack.addEventListener('pointerdown', (e) => this._beginTimelineDrag(e, 'new'));
    rulerTrack.addEventListener('pointermove', (e) => this._onRulerPointerMove(e));
    rulerTrack.addEventListener('pointerup', (e) => this._onRulerPointerUp(e));
    rulerTrack.addEventListener('pointercancel', () => this._onRulerPointerCancel());
    rulerTrack.addEventListener('lostpointercapture', () => this._onRulerPointerCancel());
    this._rulerTrack = rulerTrack;
    rulerRow.appendChild(rulerTrack);

    rowsWrap.appendChild(rulerRow);

    // ── Second pass: build rows ───────────────────────────────────────────────
    const chip: string = song?.chip ?? 'gameboy';
    for (const rowInfo of rowData) {
      const ch = rowInfo.ch;
      const channelId: number = ch.id ?? 0;
      const color = getChannelColor(chip, channelId);
      const segs = rowInfo.segs;

      // ── Row ──────────────────────────────────────────────────────────────
      const row = document.createElement('div');
      row.className = 'bb-pgrid__row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `Channel ${channelId}`);

      // ── Mute / Solo controls ─────────────────────────────────────────────
      const muteBtn = document.createElement('button');
      muteBtn.className = 'bb-pgrid__btn bb-pgrid__btn--mute';
      muteBtn.type = 'button';
      muteBtn.textContent = 'M';
      muteBtn.setAttribute('aria-label', `Mute channel ${channelId}`);
      muteBtn.setAttribute('aria-pressed', 'false');
      muteBtn.title = `Mute channel ${channelId}`;
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleChannelMuted(channelId);
      });

      const soloBtn = document.createElement('button');
      soloBtn.className = 'bb-pgrid__btn bb-pgrid__btn--solo';
      soloBtn.type = 'button';
      soloBtn.textContent = 'S';
      soloBtn.setAttribute('aria-label', `Solo channel ${channelId}`);
      soloBtn.setAttribute('aria-pressed', 'false');
      soloBtn.title = `Solo channel ${channelId}`;
      soloBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleChannelSoloed(channelId);
      });

      const controls = document.createElement('div');
      controls.className = 'bb-pgrid__controls';
      controls.append(muteBtn, soloBtn);
      row.appendChild(controls);

      // Coloured channel dot (decorative)
      const dot = document.createElement('span');
      dot.className = 'bb-pgrid__dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.background = color;
      dot.style.boxShadow = `0 0 5px ${hexToRgba(color, 0.5)}`;
      row.appendChild(dot);

      // Track strip (blocks + cursor)
      const track = document.createElement('div');
      track.className = 'bb-pgrid__track';
      const patternToneByName = new Map<string, number>();
      const toneLevels = [0.80, 0.64, 0.48, 0.32];

      const channelTotal = rowInfo.displayTotal;

      for (const seg of segs) {
        const block = document.createElement('div');
        block.className = 'bb-pgrid__block';
        const displayUnits = seg.count;
        const startStep = seg.startStep;
        const endStep = seg.endStep;
        if (displayUnits <= 1) block.classList.add('bb-pgrid__block--compact');
        block.style.flex = `0 0 ${(displayUnits / Math.max(1, this._globalEventTotal)) * 100}%`;
        let tone = patternToneByName.get(seg.patName);
        if (tone === undefined) {
          tone = toneLevels[hashPatternName(seg.patName) % toneLevels.length];
          patternToneByName.set(seg.patName, tone);
        }
        block.style.background = hexToRgba(color, tone);
        block.style.borderColor = hexToRgba(color, Math.min(0.95, tone + 0.18));
        const blockLabel = seg.seqName ? `${seg.seqName} › ${seg.patName}` : seg.patName;
        const chipLabel = abbreviatePatternName(seg.patName);
        block.title = `${blockLabel}\nClick: go to pattern · Shift+click: play section`;
        block.setAttribute('role', 'button');
        block.setAttribute('tabindex', '0');
        block.setAttribute('aria-label', `Pattern block: ${blockLabel}. Click to navigate, Shift+click to play section.`);
        block.dataset['label'] = chipLabel;
        block.dataset['startStep'] = String(startStep);
        block.dataset['endStep'] = String(endStep);

        const labelEl = document.createElement('span');
        labelEl.className = 'bb-pgrid__block-label';
        labelEl.textContent = chipLabel;
        labelEl.setAttribute('aria-hidden', 'true');
        block.appendChild(labelEl);

        const patName = seg.patName;
        const sliceRequest = {
          channelId,
          startStep,
          endStep,
          seqName: seg.seqName,
          patName,
        };
        block.addEventListener('click', (e) => {
          if (e.shiftKey && this.onPlaySlice) {
            e.preventDefault();
            this.onPlaySlice(sliceRequest);
            return;
          }
          this.onNavigate?.(patName);
        });
        block.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (e.shiftKey && this.onPlaySlice) this.onPlaySlice(sliceRequest);
            else this.onNavigate?.(patName);
          }
        });
        block.style.cursor = 'pointer';
        track.appendChild(block);
      }

      // Transparent filler block for the unused tail (if channel is shorter)
      const tailEvents = this._globalEventTotal - channelTotal;
      if (tailEvents > 0) {
        const filler = document.createElement('div');
        filler.className = 'bb-pgrid__block bb-pgrid__block--filler';
        filler.style.flex = `0 0 ${(tailEvents / Math.max(1, this._globalEventTotal)) * 100}%`;
        track.appendChild(filler);
      }

      // Playback cursor line (decorative)
      const cursor = document.createElement('div');
      cursor.className = 'bb-pgrid__cursor bb-pgrid__cursor--channel';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.style.display = 'none';
      track.appendChild(cursor);

      row.appendChild(track);
      rowsWrap.appendChild(row);
      this._rows.set(channelId, { track, cursor, muteBtn, soloBtn });
    }

    this.el.appendChild(rowsWrap);
    this._setupLayoutObserver();

    // Apply current mute/solo state and timeline range state
    this._syncMuteSolo();
    this._syncRangeDom();
    if (playbackStatus.get() === 'stopped') {
      this._showIdlePlayhead();
    }
  }

  /** Move the cursor for a channel. `progress` is 0.0 – 1.0. */
  setPosition(channelId: number, progress: number): void {
    const row = this._rows.get(channelId);
    if (!row) return;
    const pct = Math.min(99.5, Math.max(0, progress * 100));
    row.cursor.style.display = 'block';
    row.cursor.classList.remove('bb-pgrid__cursor--paused');
    row.cursor.style.left = `${pct}%`;
  }

  /** Move the global playhead from elapsed-time progress (0.0 – 1.0). */
  setGlobalProgress(progress: number): void {
    const pct = Math.min(99.5, Math.max(0, progress * 100));
    this._setGlobalCursorPosition(pct);
  }

  /** Reset only the global playhead (used on loop boundaries). */
  resetGlobalCursor(): void {
    this._globalPct = 0;
    if (!this._globalCursor) return;
    this._globalCursor.style.display = 'none';
    this._globalCursor.classList.remove('bb-pgrid__cursor--paused');
  }

  /**
   * Dim cursors but keep them visible at their last position.
   * Call on playback:paused so the user can see where playback is.
   */
  pausePositions(): void {
    for (const { cursor } of this._rows.values()) {
      if (cursor.style.display !== 'none') {
        cursor.classList.add('bb-pgrid__cursor--paused');
      }
    }
    if (this._globalCursor && this._globalCursor.style.display !== 'none') {
      this._globalCursor.classList.add('bb-pgrid__cursor--paused');
    }
  }

  /** Remove paused dimming — call when playback resumes. */
  resumePositions(): void {
    for (const { cursor } of this._rows.values()) {
      cursor.classList.remove('bb-pgrid__cursor--paused');
    }
    this._globalCursor?.classList.remove('bb-pgrid__cursor--paused');
  }

  /** Rewind all cursors to the idle playhead position. Call on playback:stopped. */
  clearPositions(): void {
    this._showIdlePlayhead();
  }

  dispose(): void {
    this._teardownLayoutObserver();
    window.removeEventListener('resize', this._onWindowResize);
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _showIdlePlayhead(): void {
    if (this._rows.size === 0) return;
    const step = idlePlayheadStep({
      loop: getActivePlaybackLoopRange(),
      startStep: playbackStartStep.get(),
    });
    const pct = Math.min(99.5, stepPct(step, this._globalEventTotal));
    for (const { cursor } of this._rows.values()) {
      cursor.style.display = 'block';
      cursor.style.left = `${pct}%`;
      cursor.classList.remove('bb-pgrid__cursor--paused');
    }
    if (this._globalCursor) {
      this._globalCursor.classList.remove('bb-pgrid__cursor--paused');
      this._setGlobalCursorPosition(pct);
    }
  }

  private _rulerStepAt(clientX: number): number {
    const track = this._rulerTrack;
    if (!track) return 0;
    return stepFromClientX(clientX, track.getBoundingClientRect(), this._globalEventTotal);
  }

  private _beginTimelineDrag(event: PointerEvent, kind: TimelineDragKind): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this._drag = {
      kind,
      pointerId: event.pointerId,
      anchorStep: this._rulerStepAt(event.clientX),
      originX: event.clientX,
      moved: false,
    };
    try { this._rulerTrack?.setPointerCapture(event.pointerId); } catch { /* jsdom / detached */ }
  }

  private _onRulerPointerMove(event: PointerEvent): void {
    const drag = this._drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.abs(event.clientX - drag.originX) < 4) return;
    drag.moved = true;
    const snap = event.altKey ? 'step' as const : 'pattern' as const;
    const result = resolveTimelineGesture(
      drag.kind,
      drag.anchorStep,
      this._rulerStepAt(event.clientX),
      true,
      this._stepBoundaries,
      playbackLoopRange.get(),
      { snap },
    );
    if (result.kind === 'start') {
      this._dragPreview = { start: result.startStep };
      this._syncRangeDom();
    } else if (result.kind === 'loop') {
      this._dragPreview = { loop: result.loop };
      this._syncRangeDom();
    }
  }

  private _onRulerPointerUp(event: PointerEvent): void {
    const drag = this._drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this._drag = null;
    this._dragPreview = null;
    try { this._rulerTrack?.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
    const snap = event.altKey ? 'step' as const : 'pattern' as const;
    const result = resolveTimelineGesture(
      drag.kind,
      drag.anchorStep,
      this._rulerStepAt(event.clientX),
      drag.moved,
      this._stepBoundaries,
      playbackLoopRange.get(),
      { snap },
    );
    if (result.kind === 'none') {
      this._syncRangeDom();
      return;
    }
    if (result.kind === 'start') {
      if (this.onPickStart) {
        this.onPickStart(result.startStep);
      } else {
        setPlaybackStartStep(result.startStep);
        if (getActivePlaybackLoopRange()) playbackLoopEnabled.set(false);
      }
      this._syncRangeDom();
      return;
    }
    const enableLoop = drag.kind === 'new';
    if (this.onPickLoop) {
      this.onPickLoop(result.loop, enableLoop);
    } else {
      setPlaybackLoopRange(result.loop);
      if (enableLoop) playbackLoopEnabled.set(true);
    }
    this._syncRangeDom();
  }

  private _onRulerPointerCancel(): void {
    if (!this._drag && !this._dragPreview) return;
    this._drag = null;
    this._dragPreview = null;
    this._syncRangeDom();
  }

  private _syncRangeDom(): void {
    const rulerControls = this._rulerControls;
    const rulerTrack = this._rulerTrack;
    const loopOverlay = this._loopRangeOverlay;
    const startOverlay = this._startMarkerOverlay;
    if (!rulerControls || !rulerTrack || !loopOverlay || !startOverlay) return;

    const pendingStart = playbackStartStep.get();
    const loopRange = playbackLoopRange.get();
    const loopEnabled = playbackLoopEnabled.get();
    const dragPreview = this._dragPreview;

    const draggingLoop = !!dragPreview && 'loop' in dragPreview;
    const shownLoop = draggingLoop ? dragPreview.loop ?? null : loopRange;
    const shownLoopInactive = !!shownLoop && !loopEnabled && !draggingLoop;
    const shownStart = dragPreview && 'start' in dragPreview ? dragPreview.start ?? null : pendingStart;
    const showStartMarker = (!shownLoop || shownLoopInactive) && shownStart !== null && shownStart > 0;
    const total = this._globalEventTotal;

    // ── Ruler controls (`✕` clear button or `Pos` heading) ──────────────────
    rulerControls.innerHTML = '';
    if (loopRange) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'bb-pgrid__btn bb-pgrid__btn--clear-range';
      clearBtn.setAttribute('aria-label', 'Clear loop range');
      clearBtn.title = 'Clear loop range';
      clearBtn.textContent = '✕';
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearPlaybackLoopRange();
      });
      rulerControls.appendChild(clearBtn);
    } else if (pendingStart !== null && pendingStart > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'bb-pgrid__btn bb-pgrid__btn--clear-range';
      clearBtn.setAttribute('aria-label', 'Clear start marker');
      clearBtn.title = 'Clear start marker (play from the beginning)';
      clearBtn.textContent = '✕';
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setPlaybackStartStep(null);
      });
      rulerControls.appendChild(clearBtn);
    } else {
      const heading = document.createElement('span');
      heading.className = 'bb-pgrid__section-heading';
      heading.textContent = 'Pos';
      rulerControls.appendChild(heading);
    }

    // ── Ruler track contents ────────────────────────────────────────────────
    rulerTrack.dataset['rangeMode'] = loopRange && loopEnabled ? 'loop' : pendingStart ? 'pending-start' : 'off';
    rulerTrack.innerHTML = '';

    if (shownLoop) {
      const rulerLoop = document.createElement('div');
      rulerLoop.className = `bb-pgrid__ruler-loop${shownLoopInactive ? ' bb-pgrid__ruler-loop--inactive' : ''}`;
      rulerLoop.style.left = `${stepPct(shownLoop.startStep, total)}%`;
      rulerLoop.style.width = `${stepPct(shownLoop.endStep - shownLoop.startStep, total)}%`;
      rulerLoop.title = shownLoopInactive
        ? `Loop ${stepLabel(shownLoop.startStep)} – ${stepLabel(shownLoop.endStep - 1)} (off — turn Loop on to repeat it)`
        : `Loop ${stepLabel(shownLoop.startStep)} – ${stepLabel(shownLoop.endStep - 1)}`;

      const startHandle = document.createElement('span');
      startHandle.className = 'bb-pgrid__loop-handle bb-pgrid__loop-handle--start';
      startHandle.setAttribute('role', 'separator');
      startHandle.setAttribute('aria-label', 'Loop start handle');
      startHandle.title = 'Drag to move loop start';
      startHandle.addEventListener('pointerdown', (e) => this._beginTimelineDrag(e, 'loop-start'));
      rulerLoop.appendChild(startHandle);

      const endHandle = document.createElement('span');
      endHandle.className = 'bb-pgrid__loop-handle bb-pgrid__loop-handle--end';
      endHandle.setAttribute('role', 'separator');
      endHandle.setAttribute('aria-label', 'Loop end handle');
      endHandle.title = 'Drag to move loop end';
      endHandle.addEventListener('pointerdown', (e) => this._beginTimelineDrag(e, 'loop-end'));
      rulerLoop.appendChild(endHandle);

      rulerTrack.appendChild(rulerLoop);
    }

    if (showStartMarker && shownStart !== null) {
      const flag = document.createElement('span');
      flag.className = 'bb-pgrid__start-flag';
      flag.setAttribute('role', 'separator');
      flag.setAttribute('aria-label', `Pending start at ${stepLabel(shownStart)}`);
      flag.title = `Pending start (${stepLabel(shownStart)}) — drag to move`;
      flag.style.left = `${stepPct(shownStart, total)}%`;
      flag.addEventListener('pointerdown', (e) => this._beginTimelineDrag(e, 'start'));
      rulerTrack.appendChild(flag);
    }

    // ── Row overlays (loop range + dashed start marker) ─────────────────────
    const hasLayout = this._ensureGlobalCursorLayout();
    if (shownLoop && total > 0 && shownLoop.endStep > shownLoop.startStep) {
      const startPct = shownLoop.startStep / total;
      const widthPct = (shownLoop.endStep - shownLoop.startStep) / total;
      loopOverlay.className = [
        'bb-pgrid__loop-range',
        dragPreview ? 'bb-pgrid__loop-range--preview' : '',
        shownLoopInactive ? 'bb-pgrid__loop-range--inactive' : '',
      ].filter(Boolean).join(' ');
      loopOverlay.style.display = 'block';
      if (hasLayout) {
        loopOverlay.style.left = `${this._globalCursorXOffset + this._globalCursorTrackWidth * startPct}px`;
        loopOverlay.style.width = `${this._globalCursorTrackWidth * widthPct}px`;
      } else {
        loopOverlay.style.left = `${startPct * 100}%`;
        loopOverlay.style.width = `${widthPct * 100}%`;
      }
    } else {
      loopOverlay.style.display = 'none';
    }

    if (showStartMarker && shownStart !== null && total > 0) {
      const pct = Math.min(1, Math.max(0, shownStart / total));
      startOverlay.style.display = 'block';
      if (hasLayout) {
        startOverlay.style.left = `${this._globalCursorXOffset + this._globalCursorTrackWidth * pct}px`;
      } else {
        startOverlay.style.left = `${pct * 100}%`;
      }
    } else {
      startOverlay.style.display = 'none';
    }
  }

  private _setGlobalCursorPosition(pct: number): void {
    const global = this._globalCursor;
    if (!global) return;

    global.style.display = 'block';
    global.classList.remove('bb-pgrid__cursor--paused');
    this._globalPct = pct;

    if (!this._ensureGlobalCursorLayout()) {
      global.style.left = `${pct}%`;
      return;
    }

    const x = this._globalCursorXOffset + this._globalCursorTrackWidth * (pct / 100);
    global.style.left = `${x}px`;
  }

  private _invalidateGlobalCursorLayout(): void {
    this._globalCursorLayoutValid = false;
  }

  private _ensureGlobalCursorLayout(): boolean {
    if (this._globalCursorLayoutValid) return true;

    const rowsWrap = this._rowsWrap;
    const firstRow = this._rows.values().next().value as RowMeta | undefined;
    if (!rowsWrap || !firstRow) return false;

    // Anchor to the track start (not full row start) so x=0 aligns to the
    // first pattern block instead of the M/S controls.
    const wrapRect = rowsWrap.getBoundingClientRect();
    const trackRect = firstRow.track.getBoundingClientRect();
    if (wrapRect.width <= 0 || trackRect.width <= 0) return false;

    this._globalCursorXOffset = trackRect.left - wrapRect.left;
    this._globalCursorTrackWidth = trackRect.width;
    this._globalCursorLayoutValid = true;
    return true;
  }

  private _setupLayoutObserver(): void {
    this._teardownLayoutObserver();
    const rowsWrap = this._rowsWrap;
    const firstRow = this._rows.values().next().value as RowMeta | undefined;
    if (!rowsWrap || !firstRow || typeof ResizeObserver === 'undefined') return;

    this._layoutObserver = new ResizeObserver(() => {
      this._invalidateGlobalCursorLayout();
      this._syncRangeDom();
      if (this._globalCursor && this._globalCursor.style.display !== 'none') {
        const paused = this._globalCursor.classList.contains('bb-pgrid__cursor--paused');
        this._setGlobalCursorPosition(this._globalPct);
        if (paused) this._globalCursor.classList.add('bb-pgrid__cursor--paused');
      }
    });
    this._layoutObserver.observe(rowsWrap);
    this._layoutObserver.observe(firstRow.track);
  }

  private _teardownLayoutObserver(): void {
    this._layoutObserver?.disconnect();
    this._layoutObserver = null;
  }

  private _syncMuteSolo(): void {
    const states = channelStates.get();
    for (const [channelId, row] of this._rows.entries()) {
      const info = states[channelId];
      if (!info) continue;
      const audible = isChannelAudible(states, channelId);
      row.muteBtn.classList.toggle('bb-pgrid__btn--active', !!info.muted);
      row.muteBtn.setAttribute('aria-pressed', String(!!info.muted));
      row.soloBtn.classList.toggle('bb-pgrid__btn--active', !!info.soloed);
      row.soloBtn.setAttribute('aria-pressed', String(!!info.soloed));
      row.track.style.opacity = audible ? '1' : '0.4';
    }
  }
}
