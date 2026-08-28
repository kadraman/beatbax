/**
 * Arrangement-slice playback — build a synthetic `.bax` that plays one
 * time-aligned column of the Pattern Grid (overlapping pats/seqs across
 * channels) without rewriting the editor buffer.
 *
 * @module editor/arrangement-slice
 */

import { getIdentifierAtColumn } from './cursor-ident.js';

/** Lines kept when building a synthetic preview source (strip channel/play). */
export const SYNTHETIC_KEEP_LINES_RE =
  /^\s*(?:(?:inst|effect|pat|seq|bpm|time|chip|ticksPerStep|stepsPerBar|volume|import)\b|#|\/\/|$)/;

export interface ArrangementSliceAnchor {
  channelId: number;
  /** Inclusive start step of the clicked block. */
  startStep: number;
  /** Exclusive end step of the clicked block. */
  endStep: number;
  seqName: string | null;
  patName: string;
}

export interface ArrangementSliceOptions {
  /** Emit `play auto repeat` instead of `play`. */
  loop?: boolean;
}

export interface ArrangementSliceResult {
  source: string;
  window: { startStep: number; endStep: number };
  /** True when at least one overlapping pat extends past the clicked window. */
  misaligned: boolean;
  warning?: string;
}

export interface SectionFocusChannelRef {
  channelId: number;
  inst: string;
  seqName: string;
}

/** UI/editor metadata for an arrangement section focus (Pattern Grid + Monaco). */
export interface SectionFocusInfo {
  window: { startStep: number; endStep: number };
  /** Fixed display title until `.bax` has named sections. */
  sectionLabel: string;
  /** 1-based line of the section comment when found. */
  commentLine?: number;
  /** Per-channel seq refs included in this section slice. */
  channels: SectionFocusChannelRef[];
  /** 1-based lines of `seq name = …` definitions to highlight. */
  seqDefinitionLines: number[];
  /** Seq on the clicked channel, when known. */
  primarySeqName: string | null;
}

interface SliceChannelPick {
  channelId: number;
  inst: string;
  kind: 'seq' | 'pats';
  refs: string[];
  misaligned: boolean;
}

export interface TimedSegment {
  channelId: number;
  patName: string;
  seqName: string | null;
  startStep: number;
  endStep: number;
}

interface SliceSegment {
  patName: string;
  seqName: string | null;
  count: number;
}

interface ChannelTimeline {
  channelId: number;
  inst: string | null;
  segments: TimedSegment[];
}

// ── Segment helpers (aligned with Desktop Pattern Grid) ─────────────────────

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

function buildSegmentsFromEvents(events: any[]): SliceSegment[] {
  const segs: SliceSegment[] = [];
  let cur: SliceSegment | null = null;
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
  out: SliceSegment[],
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

function buildSegmentsFromAstChannel(astChannel: any, ast: any, pats: Record<string, string[]>): SliceSegment[] {
  const tokens = getAstChannelSpecTokens(astChannel);
  if (tokens.length === 0) return [];

  const segs: SliceSegment[] = [];
  const astSeqs: Record<string, any> = ast?.seqs ?? {};
  for (const token of tokens) {
    const refName = tokenToPatternName(token);
    const rootSeqName = Array.isArray(astSeqs[refName]) ? refName : null;
    expandRefToPatternSegments(token, astSeqs, pats, rootSeqName, segs, new Set<string>());
  }
  return segs;
}

function splitRepeatedPatternRuns(
  segs: SliceSegment[],
  pats: Record<string, string[]>,
  patternDurations: Record<string, number>,
): SliceSegment[] {
  const out: SliceSegment[] = [];
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

function getSegmentDisplayUnits(
  seg: SliceSegment,
  pats: Record<string, string[]>,
  patternDurations: Record<string, number>,
): number {
  return getPatternDuration(seg.patName, patternDurations, pats) || seg.count;
}

/** Parse `channel N => inst NAME …` lines → channel id → instrument. */
export function parseChannelInstruments(fullSource: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of fullSource.split('\n')) {
    const m = line.match(/^\s*channel\s+(\d+)\s*=>\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) map.set(Number(m[1]), m[2]);
  }
  return map;
}

/**
 * Build per-channel timed segments from the same rules as the Pattern Grid.
 */
export function buildChannelTimelines(
  fullSource: string,
  song: any,
  ast?: any,
): ChannelTimeline[] {
  const channels: any[] = song?.channels ?? [];
  const pats: Record<string, string[]> = song?.pats ?? {};
  const patternDurations = buildPatternDurations(ast, pats);
  const instByChannel = parseChannelInstruments(fullSource);

  return channels.map((ch) => {
    const channelId = Number(ch?.id ?? 0);
    const events: any[] = ch.events ?? [];
    const astChannel = (ast?.channels ?? []).find((c: any) => (c?.id ?? 0) === channelId);
    const astSegs = astChannel ? buildSegmentsFromAstChannel(astChannel, ast, pats) : [];
    const segs = splitRepeatedPatternRuns(
      astSegs.length > 0 ? astSegs : buildSegmentsFromEvents(events),
      pats,
      patternDurations,
    );

    let cursor = 0;
    const timed: TimedSegment[] = segs.map((seg) => {
      const units = getSegmentDisplayUnits(seg, pats, patternDurations);
      const startStep = cursor;
      const endStep = cursor + Math.max(1, units);
      cursor = endStep;
      return {
        channelId,
        patName: seg.patName,
        seqName: seg.seqName,
        startStep,
        endStep,
      };
    });

    return {
      channelId,
      inst: instByChannel.get(channelId)
        ?? (typeof ch?.defaultInstrument === 'string' ? ch.defaultInstrument : null)
        ?? (typeof astChannel?.inst === 'string' ? astChannel.inst : null),
      segments: timed,
    };
  });
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Expand a clicked block to the containing sequence item's full span when
 * `seqName` is present; otherwise keep the single pattern block window.
 */
export function resolveSliceWindow(
  timelines: ChannelTimeline[],
  anchor: ArrangementSliceAnchor,
): { startStep: number; endStep: number } {
  const row = timelines.find((t) => t.channelId === anchor.channelId);
  if (!row || !anchor.seqName) {
    return { startStep: anchor.startStep, endStep: Math.max(anchor.startStep + 1, anchor.endStep) };
  }

  const mid = (anchor.startStep + anchor.endStep) / 2;
  const hit = row.segments.find(
    (s) => s.seqName === anchor.seqName && s.startStep <= mid && mid < s.endStep,
  );
  if (!hit) {
    return { startStep: anchor.startStep, endStep: Math.max(anchor.startStep + 1, anchor.endStep) };
  }

  // Contiguous run of the same seqName containing the hit.
  let startIdx = row.segments.indexOf(hit);
  let endIdx = startIdx;
  while (startIdx > 0 && row.segments[startIdx - 1].seqName === anchor.seqName) startIdx--;
  while (endIdx < row.segments.length - 1 && row.segments[endIdx + 1].seqName === anchor.seqName) endIdx++;

  return {
    startStep: row.segments[startIdx].startStep,
    endStep: row.segments[endIdx].endStep,
  };
}

function contiguousSeqSpan(
  segments: TimedSegment[],
  seqName: string,
  pointStep: number,
): { startStep: number; endStep: number } | null {
  const hit = segments.find(
    (s) => s.seqName === seqName && s.startStep <= pointStep && pointStep < s.endStep,
  );
  if (!hit) return null;
  let startIdx = segments.indexOf(hit);
  let endIdx = startIdx;
  while (startIdx > 0 && segments[startIdx - 1].seqName === seqName) startIdx--;
  while (endIdx < segments.length - 1 && segments[endIdx + 1].seqName === seqName) endIdx++;
  return {
    startStep: segments[startIdx].startStep,
    endStep: segments[endIdx].endStep,
  };
}

function pickChannelRef(
  segments: TimedSegment[],
  overlapping: TimedSegment[],
  window: { startStep: number; endStep: number },
): { kind: 'seq' | 'pats'; refs: string[]; misaligned: boolean } {
  const windowWidth = Math.max(1, window.endStep - window.startStep);
  const mid = (window.startStep + window.endStep) / 2;

  // Prefer the sequence under the window midpoint — exact span equality is too
  // brittle when channels have slight duration differences, and listing every
  // overhanging pat looks like a "random" subset of the song.
  const atMid = overlapping.find((s) => s.startStep <= mid && mid < s.endStep);
  if (atMid?.seqName) {
    const span = contiguousSeqSpan(segments, atMid.seqName, mid);
    if (span) {
      const overlapStart = Math.max(span.startStep, window.startStep);
      const overlapEnd = Math.min(span.endStep, window.endStep);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      if (overlap / windowWidth >= 0.5) {
        const misaligned = span.startStep < window.startStep || span.endStep > window.endStep
          || window.startStep < span.startStep || window.endStep > span.endStep;
        return { kind: 'seq', refs: [atMid.seqName], misaligned };
      }
    }
  }

  // Exact full-window seq match (aligned multi-channel sections).
  const seqNames = [...new Set(overlapping.map((s) => s.seqName).filter((n): n is string => !!n))];
  if (seqNames.length === 1) {
    const seqName = seqNames[0];
    const span = contiguousSeqSpan(segments, seqName, window.startStep);
    if (
      span
      && span.startStep === window.startStep
      && span.endStep === window.endStep
    ) {
      return { kind: 'seq', refs: [seqName], misaligned: false };
    }
  }

  // Pats whose center lies inside the window (ignore thin overhangs).
  const centered = overlapping.filter((s) => {
    const segMid = (s.startStep + s.endStep) / 2;
    return window.startStep <= segMid && segMid < window.endStep;
  });
  const pats = (centered.length > 0 ? centered : overlapping).map((s) => s.patName);
  const misaligned = overlapping.some(
    (s) => s.startStep < window.startStep || s.endStep > window.endStep,
  );
  return { kind: 'pats', refs: pats, misaligned };
}

function firstDeclaredInstrument(fullSource: string): string | null {
  for (const line of fullSource.split('\n')) {
    const m = line.match(/^\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) return m[1];
  }
  return null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSeqDefinitionLine(fullSource: string, seqName: string): number | null {
  const lines = fullSource.split('\n');
  const re = new RegExp(`^\\s*seq\\s+${escapeRegex(seqName)}\\s*=`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return null;
}

/** Nearest `# --- Section …` (or generic `# --- … ---`) comment directly above a seq line. */
export function findSectionCommentAbove(
  fullSource: string,
  aboveLine: number,
): { label: string; line: number } | null {
  const lines = fullSource.split('\n');
  for (let i = aboveLine - 2; i >= 0; i--) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;

    // Stop at a prior seq definition — do not attach a distant section header.
    if (/^\s*seq\s+/i.test(line)) return null;

    const section = line.match(/^\s*#\s*---\s*Section\s+\d+:\s*(.+)$/i);
    if (section) {
      const label = section[1].replace(/\s*---\s*$/, '').trim();
      return { label, line: i + 1 };
    }

    const generic = line.match(/^\s*#\s*---\s*(.+?)\s*---\s*$/);
    if (generic && !/^Section\s+\d+:/i.test(generic[1])) {
      return { label: generic[1].trim(), line: i + 1 };
    }

    // Non-section comment or other content blocks the search.
    if (/^\s*#/.test(line)) continue;
    return null;
  }
  return null;
}

function collectSliceChannelPicks(
  timelines: ChannelTimeline[],
  window: { startStep: number; endStep: number },
  fallbackInst: string | null,
): SliceChannelPick[] {
  const picks: SliceChannelPick[] = [];
  for (const row of timelines) {
    const overlapping = row.segments.filter((s) =>
      overlaps(s.startStep, s.endStep, window.startStep, window.endStep),
    );
    if (overlapping.length === 0) continue;

    const inst = row.inst ?? fallbackInst;
    if (!inst) continue;

    const picked = pickChannelRef(row.segments, overlapping, window);
    picks.push({
      channelId: row.channelId,
      inst,
      kind: picked.kind,
      refs: picked.refs,
      misaligned: picked.misaligned,
    });
  }
  return picks.sort((a, b) => a.channelId - b.channelId);
}

/**
 * Resolve section-focus metadata for Pattern Grid + editor highlighting.
 */
export function resolveSectionFocus(
  fullSource: string,
  song: any,
  ast: any | undefined,
  anchor: ArrangementSliceAnchor,
): SectionFocusInfo | null {
  const timelines = buildChannelTimelines(fullSource, song, ast);
  if (timelines.length === 0) return null;

  const window = resolveSliceWindow(timelines, anchor);
  if (window.endStep <= window.startStep) return null;

  const fallbackInst = firstDeclaredInstrument(fullSource);
  const picks = collectSliceChannelPicks(timelines, window, fallbackInst);
  if (picks.length === 0) return null;

  const channels: SectionFocusChannelRef[] = picks.map((pick) => ({
    channelId: pick.channelId,
    inst: pick.inst,
    seqName: pick.kind === 'seq' ? pick.refs[0] : pick.refs.join(' '),
  }));

  const namedSeqs = picks
    .filter((pick) => pick.kind === 'seq')
    .map((pick) => pick.refs[0]);

  const seqDefinitionLines = [...new Set(
    namedSeqs
      .map((name) => findSeqDefinitionLine(fullSource, name))
      .filter((line): line is number => line !== null),
  )].sort((a, b) => a - b);

  const primarySeqName = anchor.seqName
    ?? picks.find((pick) => pick.channelId === anchor.channelId && pick.kind === 'seq')?.refs[0]
    ?? namedSeqs[0]
    ?? null;

  const blockStartLine = seqDefinitionLines.length > 0
    ? Math.min(...seqDefinitionLines)
    : (primarySeqName ? findSeqDefinitionLine(fullSource, primarySeqName) : null);

  const comment = blockStartLine ? findSectionCommentAbove(fullSource, blockStartLine) : null;

  return {
    window,
    sectionLabel: 'Section',
    commentLine: comment?.line,
    channels,
    seqDefinitionLines,
    primarySeqName,
  };
}

/**
 * Build a synthetic BeatBax source that plays only the arrangement slice
 * overlapping the anchored Pattern Grid block.
 */
export function buildArrangementSliceSource(
  fullSource: string,
  song: any,
  ast: any | undefined,
  anchor: ArrangementSliceAnchor,
  options: ArrangementSliceOptions = {},
): ArrangementSliceResult | null {
  const timelines = buildChannelTimelines(fullSource, song, ast);
  if (timelines.length === 0) return null;

  const window = resolveSliceWindow(timelines, anchor);
  if (window.endStep <= window.startStep) return null;

  const baseLines = fullSource.split('\n').filter((l) => SYNTHETIC_KEEP_LINES_RE.test(l));
  const fallbackInst = firstDeclaredInstrument(fullSource);
  const newLines = [...baseLines];

  const picks = collectSliceChannelPicks(timelines, window, fallbackInst);
  if (picks.length === 0) return null;

  let anyMisaligned = false;
  for (const pick of picks) {
    if (pick.misaligned) anyMisaligned = true;
    if (pick.kind === 'seq') {
      newLines.push(`channel ${pick.channelId} => inst ${pick.inst} seq ${pick.refs[0]}`);
    } else {
      const synthName = `__slice_ch${pick.channelId}__`;
      newLines.push(`seq ${synthName} = ${pick.refs.join(' ')}`);
      newLines.push(`channel ${pick.channelId} => inst ${pick.inst} seq ${synthName}`);
    }
  }

  newLines.push(options.loop ? 'play auto repeat' : 'play');

  return {
    source: newLines.join('\n'),
    window,
    misaligned: anyMisaligned,
    warning: anyMisaligned
      ? 'Slice includes whole patterns that extend past this section (step trim comes with seek/loop).'
      : undefined,
  };
}

/**
 * Resolve an arrangement-slice anchor from a pat/seq name (cursor / command).
 * Uses the first timeline occurrence of that name as a seq, else as a pat.
 */
export function findArrangementSliceAnchorBySeqName(
  fullSource: string,
  song: any,
  ast: any | undefined,
  seqName: string,
): ArrangementSliceAnchor | null {
  const timelines = buildChannelTimelines(fullSource, song, ast);
  for (const row of timelines) {
    for (const seg of row.segments) {
      if (seg.seqName === seqName) {
        return {
          channelId: row.channelId,
          startStep: seg.startStep,
          endStep: seg.endStep,
          seqName,
          patName: seg.patName,
        };
      }
    }
  }
  return null;
}

const SEQ_DEF_LINE_RE = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/i;
const SECTION_HEADER_RE = /^\s*#\s*---\s*Section\s+\d+:/i;
const CHANNEL_LINE_RE = /^\s*channel\s+\d+\s*=>/i;

function seqNameFromDefinitionLine(line: string): string | null {
  const match = line.match(SEQ_DEF_LINE_RE);
  return match?.[1] ?? null;
}

function scanSeqNameFromLines(lines: string[], startIndex: number, direction: 1 | -1): string | null {
  if (direction === -1) {
    for (let i = startIndex; i >= 0; i--) {
      const line = lines[i];
      if (SECTION_HEADER_RE.test(line) || CHANNEL_LINE_RE.test(line)) break;
      const seqName = seqNameFromDefinitionLine(line);
      if (seqName) return seqName;
    }
    return null;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (CHANNEL_LINE_RE.test(line)) break;
    if (i > startIndex && SECTION_HEADER_RE.test(line)) break;
    const seqName = seqNameFromDefinitionLine(line);
    if (seqName) return seqName;
  }
  return null;
}

function seqNameNearCursorLine(lines: string[], lineNumber: number): string | null {
  const index = lineNumber - 1;
  return scanSeqNameFromLines(lines, index, -1) ?? scanSeqNameFromLines(lines, index, 1);
}

function seqRefAtColumnOnChannelLine(line: string, column: number): string | null {
  const seqMatch = line.match(/\bseq\s+/i);
  if (!seqMatch || seqMatch.index == null) return null;
  const refsStart = seqMatch.index + seqMatch[0].length;
  return getIdentifierAtColumn(line.slice(refsStart), column - refsStart);
}

function patRefAtColumnOnChannelLine(line: string, column: number): string | null {
  const patMatch = line.match(/\bpat\s+/i);
  if (!patMatch || patMatch.index == null) return null;
  const refsStart = patMatch.index + patMatch[0].length;
  return getIdentifierAtColumn(line.slice(refsStart), column - refsStart);
}

/**
 * Resolve which seq/pat name F6 should use from editor cursor position.
 * Prefers the enclosing seq definition or channel timeline ref over global name lookup.
 */
export function resolveArrangementHintAtCursor(
  fullSource: string,
  lineNumber: number,
  column: number,
): { seqName?: string; fallbackName?: string } | null {
  const lines = fullSource.split('\n');
  const line = lines[lineNumber - 1];
  if (!line) return null;

  const seqOnLine = seqNameFromDefinitionLine(line);
  if (seqOnLine) return { seqName: seqOnLine };

  if (SECTION_HEADER_RE.test(line)) {
    const seqName = scanSeqNameFromLines(lines, lineNumber, 1);
    if (seqName) return { seqName };
  }

  if (CHANNEL_LINE_RE.test(line)) {
    const seqRef = seqRefAtColumnOnChannelLine(line, column);
    if (seqRef) return { seqName: seqRef };
    const patRef = patRefAtColumnOnChannelLine(line, column);
    if (patRef) return { fallbackName: patRef };
  }

  const nearbySeq = seqNameNearCursorLine(lines, lineNumber);
  if (nearbySeq) return { seqName: nearbySeq };

  const fallbackName = getIdentifierAtColumn(line, column);
  return fallbackName ? { fallbackName } : null;
}

/** Cursor-aware arrangement anchor (avoids first global match for reused pat names). */
export function findArrangementSliceAnchorAtCursor(
  fullSource: string,
  song: any,
  ast: any | undefined,
  lineNumber: number,
  column: number,
): ArrangementSliceAnchor | null {
  const hint = resolveArrangementHintAtCursor(fullSource, lineNumber, column);
  if (!hint) return null;

  if (hint.seqName) {
    const bySeq = findArrangementSliceAnchorBySeqName(fullSource, song, ast, hint.seqName);
    if (bySeq) return bySeq;
  }

  if (hint.fallbackName) {
    return findArrangementSliceAnchorByName(fullSource, song, ast, hint.fallbackName);
  }

  return null;
}

export function findArrangementSliceAnchorByName(
  fullSource: string,
  song: any,
  ast: any | undefined,
  name: string,
): ArrangementSliceAnchor | null {
  const bySeq = findArrangementSliceAnchorBySeqName(fullSource, song, ast, name);
  if (bySeq) return bySeq;

  const timelines = buildChannelTimelines(fullSource, song, ast);
  for (const row of timelines) {
    for (const seg of row.segments) {
      if (seg.patName === name) {
        return {
          channelId: row.channelId,
          startStep: seg.startStep,
          endStep: seg.endStep,
          seqName: seg.seqName,
          patName: name,
        };
      }
    }
  }
  return null;
}

export interface ArrangementSectionBlock {
  key: string;
  label: string;
  seqName: string | null;
  patName: string;
  channelId: number;
  startStep: number;
  endStep: number;
}

function sectionGroupKey(seg: { seqName: string | null; patName: string }): string {
  return seg.seqName ? `seq:${seg.seqName}` : `pat:${seg.patName}`;
}

/**
 * Collapsed sequence-level section blocks for the Pattern Grid strip (reference channel).
 */
export function listArrangementSections(
  fullSource: string,
  song: any,
  ast: any | undefined,
): ArrangementSectionBlock[] {
  const timelines = buildChannelTimelines(fullSource, song, ast);
  const refRow = timelines.find((row) => row.segments.some((seg) => seg.seqName)) ?? timelines[0];
  if (!refRow) return [];

  const blocks: ArrangementSectionBlock[] = [];
  let current: ArrangementSectionBlock | null = null;

  for (const seg of refRow.segments) {
    const key = sectionGroupKey(seg);
    if (current && current.key === key) {
      current.endStep = seg.endStep;
      continue;
    }
    if (current) blocks.push(current);
    current = {
      key,
      label: seg.seqName ?? seg.patName,
      seqName: seg.seqName,
      patName: seg.patName,
      channelId: refRow.channelId,
      startStep: seg.startStep,
      endStep: seg.endStep,
    };
  }

  if (current) blocks.push(current);
  return blocks;
}

function findSectionIndex(
  sections: ArrangementSectionBlock[],
  window: { startStep: number; endStep: number },
): number {
  const exact = sections.findIndex(
    (section) => section.startStep === window.startStep && section.endStep === window.endStep,
  );
  if (exact >= 0) return exact;
  return sections.findIndex(
    (section) => section.startStep <= window.startStep && window.startStep < section.endStep,
  );
}

/** Previous or next section anchor relative to the active focus window. */
export function findAdjacentSectionAnchor(
  sections: ArrangementSectionBlock[],
  window: { startStep: number; endStep: number },
  direction: 'prev' | 'next',
): ArrangementSliceAnchor | null {
  if (sections.length === 0) return null;
  const index = findSectionIndex(sections, window);
  if (index < 0) return null;
  const targetIndex = direction === 'prev' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sections.length) return null;
  const block = sections[targetIndex];
  return {
    channelId: block.channelId,
    startStep: block.startStep,
    endStep: block.endStep,
    seqName: block.seqName,
    patName: block.patName,
  };
}
