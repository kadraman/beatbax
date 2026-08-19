/**
 * HugeTracker song-pattern grouping, hashing, and order-list reuse.
 *
 * UGE patterns are always 64 rows. BeatBax `pat` runs are typically 16/32/64
 * events. When every channel agrees on a run length in that set, each run
 * becomes one UGE pattern (padded) and the order list points at shared IDs.
 */

import type { ChannelEvent } from '../song/songModel.js';

export const UGE_PATTERN_ROWS = 64;
export const STRUCTURE_STEPS = [16, 32, 64] as const;
export type StructureStep = (typeof STRUCTURE_STEPS)[number];

/** Dxx pattern break: D01 starts the next order at row 0 (hUGEDriver is off-by-one). */
export const UGE_PATTERN_BREAK_CODE = 0xD;
export const UGE_PATTERN_BREAK_PARAM = 0x01;

export interface UgePatternCell {
    note: number;
    instrument: number;
    effectCode: number;
    effectParam: number;
    pan?: 'L' | 'R' | 'C';
    volume?: number;
}

export interface SourceRun {
    name: string;
    start: number;
    length: number;
    patternIndex?: number;
}

const EMPTY_NOTE = 90;

export function emptyUgeCell(): UgePatternCell {
    return {
        note: EMPTY_NOTE,
        instrument: -1,
        effectCode: 0,
        effectParam: 0,
        pan: 'C',
    };
}

export function cloneUgeCell(cell: UgePatternCell): UgePatternCell {
    return { ...cell };
}

export function cloneUgePattern(cells: UgePatternCell[]): UgePatternCell[] {
    return cells.map(cloneUgeCell);
}

export function blankUgePattern(): UgePatternCell[] {
    const rows: UgePatternCell[] = [];
    for (let i = 0; i < UGE_PATTERN_ROWS; i++) rows.push(emptyUgeCell());
    return rows;
}

export function padPatternTo64(cells: UgePatternCell[]): UgePatternCell[] {
    const out = cloneUgePattern(cells);
    while (out.length < UGE_PATTERN_ROWS) out.push(emptyUgeCell());
    if (out.length > UGE_PATTERN_ROWS) return out.slice(0, UGE_PATTERN_ROWS);
    return out;
}

/**
 * Group a channel's events into consecutive `sourcePattern` + `patternIndex` runs.
 * Consecutive repeats of the same pat stay distinct when `patternIndex` changes.
 */
export function groupSourcePatternRuns(events: ChannelEvent[]): SourceRun[] {
    if (!events.length) return [];
    const runs: SourceRun[] = [];
    let currentName = sourcePatternName(events[0]);
    let currentIndex = sourcePatternIndex(events[0]);
    let start = 0;
    for (let i = 1; i < events.length; i++) {
        const name = sourcePatternName(events[i]);
        const index = sourcePatternIndex(events[i]);
        if (name !== currentName || index !== currentIndex) {
            runs.push({ name: currentName, start, length: i - start, patternIndex: currentIndex });
            currentName = name;
            currentIndex = index;
            start = i;
        }
    }
    runs.push({ name: currentName, start, length: events.length - start, patternIndex: currentIndex });
    return runs;
}

function sourcePatternName(event: ChannelEvent | undefined): string {
    if (!event) return '';
    const name = (event as { sourcePattern?: string }).sourcePattern;
    return typeof name === 'string' ? name : '';
}

function sourcePatternIndex(event: ChannelEvent | undefined): number | undefined {
    if (!event) return undefined;
    const index = (event as { patternIndex?: number }).patternIndex;
    return typeof index === 'number' && Number.isFinite(index) ? index : undefined;
}

/**
 * Common BeatBax-pattern length for structure-aware UGE orders.
 * Returns 16, 32, or 64 only when every non-empty channel run uses that length.
 */
export function structureStepLength(runsByChannel: SourceRun[][]): StructureStep | null {
    const lengths: number[] = [];
    for (const runs of runsByChannel) {
        for (const run of runs) {
            if (run.length > 0) lengths.push(run.length);
        }
    }
    if (lengths.length === 0) return null;
    const first = lengths[0];
    if (!(STRUCTURE_STEPS as readonly number[]).includes(first)) return null;
    if (lengths.some((len) => len !== first)) return null;
    return first as StructureStep;
}

export function chunkCells(cells: UgePatternCell[], size: number): UgePatternCell[][] {
    if (size <= 0) return cells.length ? [cloneUgePattern(cells)] : [];
    const chunks: UgePatternCell[][] = [];
    for (let i = 0; i < cells.length; i += size) {
        chunks.push(cloneUgePattern(cells.slice(i, i + size)));
    }
    return chunks;
}

export function framesFromSourceRuns(
    cells: UgePatternCell[],
    runs: SourceRun[],
): UgePatternCell[][] {
    if (runs.length === 0) {
        return cells.length ? [padPatternTo64(cells)] : [];
    }
    return runs.map((run) => padPatternTo64(cells.slice(run.start, run.start + run.length)));
}

export function hashUgePattern(cells: UgePatternCell[]): string {
    const parts: string[] = [];
    const n = Math.min(UGE_PATTERN_ROWS, cells.length);
    for (let i = 0; i < UGE_PATTERN_ROWS; i++) {
        const cell = i < n ? cells[i] : undefined;
        const note = cell ? cell.note : EMPTY_NOTE;
        const inst = cell && cell.instrument >= 0 ? cell.instrument : 0;
        const code = cell ? cell.effectCode : 0;
        const param = cell ? cell.effectParam : 0;
        const vol = cell && typeof cell.volume === 'number' ? cell.volume : -1;
        parts.push(`${note},${inst},${code},${param},${vol}`);
    }
    return parts.join('|');
}

export function dedupeChannelPatterns(frames: UgePatternCell[][]): {
    unique: UgePatternCell[][];
    order: number[];
} {
    const unique: UgePatternCell[][] = [];
    const order: number[] = [];
    const hashToIndex = new Map<string, number>();
    for (const frame of frames) {
        const padded = padPatternTo64(frame);
        const hash = hashUgePattern(padded);
        const existing = hashToIndex.get(hash);
        if (existing !== undefined) {
            order.push(existing);
        } else {
            const idx = unique.length;
            hashToIndex.set(hash, idx);
            unique.push(padded);
            order.push(idx);
        }
    }
    if (unique.length === 0) {
        unique.push(blankUgePattern());
        order.push(0);
    }
    return { unique, order };
}

/** Write D01 on row `breakRow` when the effect column is free. */
export function tryWritePatternBreak(cell: UgePatternCell | undefined): boolean {
    if (!cell) return false;
    if (cell.effectCode && cell.effectCode !== 0) return false;
    cell.effectCode = UGE_PATTERN_BREAK_CODE;
    cell.effectParam = UGE_PATTERN_BREAK_PARAM;
    return true;
}

export function patternHasBreak(cell: UgePatternCell | undefined): boolean {
    return Boolean(
        cell && cell.effectCode === UGE_PATTERN_BREAK_CODE && cell.effectParam === UGE_PATTERN_BREAK_PARAM,
    );
}

/**
 * Place a global D01 at `breakRow` on every order step.
 * Prefers a free effect slot; last resort overwrites channel 1.
 */
export function applyPatternBreaks(
    channelFrames: UgePatternCell[][][],
    breakRow: number,
    onOverwrite?: (orderIdx: number) => void,
): void {
    if (breakRow < 0 || breakRow >= UGE_PATTERN_ROWS) return;
    const orderLen = Math.max(0, ...channelFrames.map((frames) => frames.length));
    for (let orderIdx = 0; orderIdx < orderLen; orderIdx++) {
        let placed = false;
        for (let ch = 0; ch < channelFrames.length; ch++) {
            const frame = channelFrames[ch][orderIdx];
            if (!frame) continue;
            if (tryWritePatternBreak(frame[breakRow])) {
                placed = true;
                break;
            }
        }
        if (placed) continue;
        const ch1 = channelFrames[0]?.[orderIdx];
        if (ch1 && ch1[breakRow]) {
            ch1[breakRow].effectCode = UGE_PATTERN_BREAK_CODE;
            ch1[breakRow].effectParam = UGE_PATTERN_BREAK_PARAM;
            onOverwrite?.(orderIdx);
        }
    }
}
