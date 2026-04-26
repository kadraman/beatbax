/**
 * PatternGrid — read-only horizontal sequence overview.
 *
 * Renders one compact row per channel. Each row has M/S buttons, a coloured
 * dot, and a flex strip of coloured blocks (one per unique contiguous pattern
 * section). A thin vertical cursor advances through the strip during playback.
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
 */

import { channelStates, toggleChannelMuted, toggleChannelSoloed, isChannelAudible } from '../stores/channel.store';
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
  // Strip repetition suffix and transform/effect suffixes, keep the base ref.
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

function buildSegmentsFromSequence(seqName: string, seqTokens: string[], pats: Record<string, string[]>): Segment[] {
  const segs: Segment[] = [];
  for (const raw of seqTokens) {
    if (typeof raw !== 'string') continue;
    const token = raw.trim();
    if (!token) continue;

    // Expand simple inline repetition syntax, e.g. "mel_a1 * 2".
    const rep = token.match(/^(.+?)\s*\*\s*(\d+)$/);
    const repeat = rep ? Math.max(1, parseInt(rep[2], 10) || 1) : 1;
    const ref = rep ? rep[1] : token;
    const patName = tokenToPatternName(ref);
    if (!patName) continue;
    const patLen = Array.isArray(pats[patName]) ? pats[patName].length : 1;

    for (let i = 0; i < repeat; i++) {
      segs.push({ patName, seqName, count: Math.max(1, patLen) });
    }
  }
  return segs;
}

function getAstChannelSpecTokens(astChannel: any): string[] {
  const seqSpec: string[] | undefined = (astChannel as any)?.seqSpecTokens;
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
  visiting: Set<string>
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
          : String((item as any)?.raw ?? (item as any)?.name ?? (item as any)?.pattern ?? (item as any)?.ref ?? '');
        if (!inner.trim()) continue;
        const itemRepeat = typeof item === 'object' && item !== null
          ? Math.max(1, Number((item as any).repeat) || 1)
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

function getSegmentDisplayUnits(seg: Segment, pats: Record<string, string[]>): number {
  const patLen = Array.isArray(pats[seg.patName]) ? pats[seg.patName].length : 0;
  return patLen > 0 ? patLen : seg.count;
}

interface RowMeta {
  track: HTMLElement;
  cursor: HTMLElement;
  muteBtn: HTMLButtonElement;
  soloBtn: HTMLButtonElement;
}

// ── Component ──────────────────────────────────────────────────────────────

export class PatternGrid {
  readonly el: HTMLElement;

  /**
   * Called when a pattern block is clicked. Receives the `pat` name so the
   * caller can navigate the Monaco editor cursor to that definition.
   */
  onNavigate?: (patName: string) => void;

  private _rows             = new Map<number, RowMeta>();
  /** Max total events (note + rest) across all channels — used as block-width denominator. */
  private _globalEventTotal = 1;
  /** Single DAW-style playhead spanning the full grid. */
  private _globalCursor: HTMLElement | null = null;
  /** Wrapper around all rows; provides global cursor coordinate space. */
  private _rowsWrap: HTMLElement | null = null;
  /** Last global cursor percentage. */
  private _globalPct = 0;
  /** Cached geometry for placing the global playhead without per-tick reflow reads. */
  private _globalCursorXOffset = 0;
  private _globalCursorTrackWidth = 0;
  private _globalCursorLayoutValid = false;
  /** Layout observers/listeners used to invalidate cached cursor geometry. */
  private _layoutObserver: ResizeObserver | null = null;
  private _onWindowResize = () => this._invalidateGlobalCursorLayout();
  /** Unsubscribe from channelStates store. */
  private _unsubStore: (() => void) | null = null;

  constructor() {
    const el = document.createElement('div');
    el.className = 'bb-pgrid';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Pattern grid');
    el.dataset['empty'] = 'true';
    this.el = el;

    // Reactively update M/S button states when channel store changes
    this._unsubStore = channelStates.subscribe(() => this._syncMuteSolo());

    // Recompute global cursor anchoring only when layout may have changed.
    window.addEventListener('resize', this._onWindowResize);
  }

  /** Rebuild the grid from a resolved SongModel (treated as `any` to avoid import deps). */
  setSong(song: any, ast?: any): void {
    this._teardownLayoutObserver();
    this.el.innerHTML = '';
    this._rows.clear();
    this._globalCursor = null;
    this._rowsWrap = null;
    this._globalPct = 0;
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

    const globalCursor = document.createElement('div');
    globalCursor.className = 'bb-pgrid__cursor bb-pgrid__cursor--global';
    globalCursor.setAttribute('aria-hidden', 'true');
    globalCursor.style.display = 'none';
    rowsWrap.appendChild(globalCursor);
    this._globalCursor = globalCursor;

    const pats: Record<string, string[]> = song?.pats ?? {};
    const rowData: RowBuildData[] = channels.map((ch) => {
      const events: any[] = ch.events ?? [];
      const astChannel = (ast?.channels ?? []).find((c: any) => (c?.id ?? 0) === (ch?.id ?? 0));
      const astSegs = astChannel ? buildSegmentsFromAstChannel(astChannel, ast, pats) : [];
      const segs = astSegs.length > 0 ? astSegs : buildSegmentsFromEvents(events);
      const displayTotal = Math.max(1, segs.reduce((acc, seg) => acc + getSegmentDisplayUnits(seg, pats), 0));
      return {
        ch,
        segs,
        displayTotal,
      };
    });

    // ── First pass: compute global totals for cross-channel alignment ────────
    let maxUnits = 1;
    for (const row of rowData) {
      if (row.displayTotal > maxUnits) maxUnits = row.displayTotal;
    }
    this._globalEventTotal = maxUnits;

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
        const displayUnits = getSegmentDisplayUnits(seg, pats);
        if (displayUnits <= 1) block.classList.add('bb-pgrid__block--compact');
        block.style.flex = `${displayUnits} 1 0%`;
        let tone = patternToneByName.get(seg.patName);
        if (tone === undefined) {
          tone = toneLevels[hashPatternName(seg.patName) % toneLevels.length];
          patternToneByName.set(seg.patName, tone);
        }
        block.style.background = hexToRgba(color, tone);
        block.style.borderColor = hexToRgba(color, Math.min(0.95, tone + 0.18));
        const blockLabel = seg.seqName ? `${seg.seqName} › ${seg.patName}` : seg.patName;
        const chipLabel = abbreviatePatternName(seg.patName);
        block.title = blockLabel;
        block.setAttribute('role', 'button');
        block.setAttribute('tabindex', '0');
        block.setAttribute('aria-label', `Navigate to pattern: ${blockLabel}`);
        block.dataset['label'] = chipLabel;

        const labelEl = document.createElement('span');
        labelEl.className = 'bb-pgrid__block-label';
        labelEl.textContent = chipLabel;
        labelEl.setAttribute('aria-hidden', 'true');
        block.appendChild(labelEl);

        // Click or Enter/Space → navigate editor to the pat definition
        const patName = seg.patName;
        block.addEventListener('click', () => this.onNavigate?.(patName));
        block.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.onNavigate?.(patName);
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
        filler.style.flex = `${tailEvents} 1 0%`;
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

    // Apply current mute/solo state to the freshly built buttons
    this._syncMuteSolo();
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

  /** Hide all cursors and clear paused state. Call on playback:stopped. */
  clearPositions(): void {
    for (const { cursor } of this._rows.values()) {
      cursor.style.display = 'none';
      cursor.classList.remove('bb-pgrid__cursor--paused');
    }
    if (this._globalCursor) {
      this._globalCursor.style.display = 'none';
      this._globalCursor.classList.remove('bb-pgrid__cursor--paused');
    }
    this._globalPct = 0;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

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
