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
 *   grid.setPosition(channelId, position.progress);      // on playback:position-changed
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

interface Segment {
  patName: string;
  seqName: string | null;
  count: number;
}

function buildSegments(events: any[]): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment | null = null;
  for (const ev of events) {
    const prevPat: string = cur ? cur.patName : '?';
    const prevSeq: string | null = cur ? cur.seqName : null;
    const pat: string = ev.sourcePattern ?? prevPat;
    const seq: string | null = ev.sourceSequence ?? prevSeq;
    if (!cur || pat !== cur.patName) {
      cur = { patName: pat, seqName: seq, count: 1 };
      segs.push(cur);
    } else {
      cur.count++;
    }
  }
  return segs;
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
  /** Note-only event count per channel, stored to normalize cursor progress. */
  private _noteTotals       = new Map<number, number>();
  /** Max note count across all channels — used to scale cursors to wall-clock time. */
  private _globalNoteTotal  = 1;
  /** Max total events (note + rest) across all channels — used as block-width denominator. */
  private _globalEventTotal = 1;
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
  }

  /** Rebuild the grid from a resolved SongModel (treated as `any` to avoid import deps). */
  setSong(song: any): void {
    this.el.innerHTML = '';
    this._rows.clear();
    this._noteTotals.clear();

    const channels: any[] = song?.channels ?? [];
    if (channels.length === 0) {
      this.el.dataset['empty'] = 'true';
      return;
    }
    delete this.el.dataset['empty'];

    // ── First pass: compute global totals for cross-channel alignment ────────
    let maxEvents = 1;
    let maxNotes  = 1;
    for (const ch of channels) {
      const events: any[] = ch.events ?? [];
      const noteCount = events.filter((e: any) => e.type === 'note' || e.type === 'named').length;
      this._noteTotals.set(ch.id ?? 0, noteCount || 1);
      if (events.length > maxEvents) maxEvents = events.length;
      if (noteCount  > maxNotes)  maxNotes  = noteCount;
    }
    this._globalEventTotal = maxEvents;
    this._globalNoteTotal  = maxNotes;

    // ── Second pass: build rows ───────────────────────────────────────────────
    const chip: string = song?.chip ?? 'gameboy';
    for (const ch of channels) {
      const channelId: number = ch.id ?? 0;
      const color = getChannelColor(chip, channelId);
      const events: any[] = ch.events ?? [];
      const segs = buildSegments(events);

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

      const channelTotal = events.length;

      let segIdx = 0;
      for (const seg of segs) {
        const block = document.createElement('div');
        block.className = 'bb-pgrid__block';
        block.style.flexGrow = String(seg.count);
        block.style.background = hexToRgba(color, segIdx % 2 === 0 ? 0.55 : 0.30);
        const blockLabel = seg.seqName ? `${seg.seqName} › ${seg.patName}` : seg.patName;
        block.title = blockLabel;
        block.setAttribute('role', 'button');
        block.setAttribute('tabindex', '0');
        block.setAttribute('aria-label', `Navigate to pattern: ${blockLabel}`);
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
        segIdx++;
      }

      // Transparent filler block for the unused tail (if channel is shorter)
      const tailEvents = this._globalEventTotal - channelTotal;
      if (tailEvents > 0) {
        const filler = document.createElement('div');
        filler.className = 'bb-pgrid__block bb-pgrid__block--filler';
        filler.style.flexGrow = String(tailEvents);
        track.appendChild(filler);
      }

      // Playback cursor line (decorative)
      const cursor = document.createElement('div');
      cursor.className = 'bb-pgrid__cursor';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.style.display = 'none';
      track.appendChild(cursor);

      row.appendChild(track);
      this.el.appendChild(row);
      this._rows.set(channelId, { track, cursor, muteBtn, soloBtn });
    }

    // Apply current mute/solo state to the freshly built buttons
    this._syncMuteSolo();
  }

  /**
   * Move the cursor for a channel. `progress` is 0.0 – 1.0 from
   * `PlaybackPosition.progress` (note eventIndex / note totalEvents).
   *
   * Normalised to the global note maximum so cursors across all channels
   * advance at the same rate (wall-clock aligned).
   */
  setPosition(channelId: number, progress: number): void {
    const row = this._rows.get(channelId);
    if (!row) return;
    const chNoteTotal = this._noteTotals.get(channelId) ?? 1;
    const rawNoteIndex = progress * chNoteTotal;
    const globalProgress = rawNoteIndex / this._globalNoteTotal;
    const pct = Math.min(99.5, Math.max(0, globalProgress * 100));
    row.cursor.style.display = 'block';
    row.cursor.classList.remove('bb-pgrid__cursor--paused');
    row.cursor.style.left = `${pct}%`;
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
  }

  /** Remove paused dimming — call when playback resumes. */
  resumePositions(): void {
    for (const { cursor } of this._rows.values()) {
      cursor.classList.remove('bb-pgrid__cursor--paused');
    }
  }

  /** Hide all cursors and clear paused state. Call on playback:stopped. */
  clearPositions(): void {
    for (const { cursor } of this._rows.values()) {
      cursor.style.display = 'none';
      cursor.classList.remove('bb-pgrid__cursor--paused');
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

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
