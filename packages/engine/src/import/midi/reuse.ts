/**
 * Pattern partitioning, content-hash reuse, and sequence playlist compression.
 */
import type {
  ConversionDiagnostic,
  MidiConvertOptions,
  PackedChannel,
  PackedHit,
  PatternDef,
  SequenceDef,
} from './types.js';

function formatToken(token: string, durationTicks: number): string {
  if (durationTicks <= 1) return token;
  return `${token}:${durationTicks}`;
}

/**
 * Convert a timeline of hits within [barStart, barStart+patternTicks) into tokens
 * that sum exactly to patternTicks.
 */
export function hitsToBarTokens(
  hits: PackedHit[],
  barStart: number,
  patternTicks: number,
): string[] {
  const barEnd = barStart + patternTicks;
  const inBar = hits
    .filter((h) => h.startTick < barEnd && h.startTick + h.durationTicks > barStart)
    .map((h) => {
      const start = Math.max(h.startTick, barStart) - barStart;
      const end = Math.min(h.startTick + h.durationTicks, barEnd) - barStart;
      return {
        start,
        duration: Math.max(1, end - start),
        token: h.token,
        instrument: h.instrument,
      };
    })
    .sort((a, b) => a.start - b.start);

  const tokens: string[] = [];
  let cursor = 0;

  for (const h of inBar) {
    if (h.start > cursor) {
      const restDur = h.start - cursor;
      tokens.push(formatToken('.', restDur));
      cursor = h.start;
    } else if (h.start < cursor) {
      // Overlap within bar — skip (already resolved in pack)
      continue;
    }
    if (h.instrument) {
      tokens.push(`inst(${h.instrument})`);
    }
    tokens.push(formatToken(h.token, h.duration));
    cursor = h.start + h.duration;
  }

  if (cursor < patternTicks) {
    tokens.push(formatToken('.', patternTicks - cursor));
  }

  // Guarantee sum
  const sum = tokens.reduce((s, t) => {
    if (t.startsWith('inst(')) return s;
    const m = t.match(/:(\d+)$/);
    return s + (m ? parseInt(m[1], 10) : 1);
  }, 0);
  if (sum < patternTicks) {
    tokens.push(formatToken('.', patternTicks - sum));
  }

  return tokens;
}

/** Deterministic FNV-1a style hash (browser-safe; no Node `crypto`). */
export function hashTokens(tokens: string[]): string {
  const input = tokens.join(' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function isRestOnly(tokens: string[]): boolean {
  return tokens.every((t) => t === '.' || /^\.:\d+$/.test(t) || t.startsWith('inst('));
}

/**
 * Compress a playlist of pattern names: a a a → a*3 (stable, greedy).
 */
export function compressPlaylist(playlist: string[]): string[] {
  if (playlist.length === 0) return [];
  const out: string[] = [];
  let i = 0;
  while (i < playlist.length) {
    const name = playlist[i]!;
    let count = 1;
    while (i + count < playlist.length && playlist[i + count] === name) count += 1;
    if (count > 1) out.push(`${name}*${count}`);
    else out.push(name);
    i += count;
  }
  return out;
}

export interface ChannelPlan {
  channelIndex: number;
  defaultInstrument: string;
  role: PackedChannel['role'];
  /** Ordered section sequence names for this channel. */
  sequenceNames: string[];
}

export interface ReuseResult {
  patterns: PatternDef[];
  sequences: SequenceDef[];
  channelPlans: ChannelPlan[];
  barsGenerated: number;
  patternsReused: number;
  /** Number of arrangement sections emitted (1 = monolithic). */
  sectionCount: number;
}

/** How many sections to emit for `barCount` given `sectionBars` (0 = force one). */
export function sectionCountForBars(barCount: number, sectionBars: number): number {
  if (sectionBars <= 0 || barCount <= sectionBars) return 1;
  return Math.ceil(barCount / sectionBars);
}

function sectionSeqName(prefix: string, sectionIndex: number, sectionCount: number, sectionBars: number): string {
  if (sectionBars <= 0 || sectionCount <= 1) return `${prefix}_seq`;
  return `${prefix}_s${String(sectionIndex + 1).padStart(2, '0')}_seq`;
}

/** Length in steps of an all-rest bar, or null when the bar holds anything else. */
function restSteps(tokens: string[]): number | null {
  let steps = 0;
  for (const t of tokens) {
    if (t === '.') {
      steps += 1;
      continue;
    }
    const m = /^\.:(\d+)$/.exec(t);
    if (!m) return null;
    steps += parseInt(m[1]!, 10);
  }
  return steps;
}

/**
 * Name interned patterns (spec 090): all-rest bars are `rest_x<steps>_pat`; the rest are
 * `<prefix>_<n>_pat`, numbered per prefix in creation order. Returned in emit order:
 * rest patterns by length, then channel patterns in creation order.
 */
function namePatterns(created: PatternDef[], prefixByHash: Map<string, string>): PatternDef[] {
  const used = new Set<string>();
  const rests: { def: PatternDef; steps: number }[] = [];
  const byPrefix = new Map<string, PatternDef[]>();
  for (const def of created) {
    const steps = restSteps(def.tokens);
    if (steps != null && !used.has(`rest_x${steps}_pat`)) {
      def.name = `rest_x${steps}_pat`;
      used.add(def.name);
      rests.push({ def, steps });
      continue;
    }
    const prefix = prefixByHash.get(def.hash)!;
    const list = byPrefix.get(prefix) ?? [];
    list.push(def);
    byPrefix.set(prefix, list);
  }
  for (const [prefix, list] of byPrefix) {
    const width = Math.max(2, String(list.length).length);
    list.forEach((def, i) => {
      def.name = `${prefix}_${String(i + 1).padStart(width, '0')}_pat`;
    });
  }
  rests.sort((a, b) => a.steps - b.steps);
  const restDefs = new Set(rests.map((r) => r.def));
  return [...restDefs, ...created.filter((def) => !restDefs.has(def))];
}

export function buildPatternsAndSequences(
  channels: PackedChannel[],
  options: MidiConvertOptions,
  diagnostics: ConversionDiagnostic[],
): ReuseResult {
  const patternTicks = options.patternTicks;
  let maxTick = 0;
  for (const ch of channels) {
    for (const h of ch.hits) {
      maxTick = Math.max(maxTick, h.startTick + Math.max(h.durationTicks, h.extentTicks ?? 0));
    }
  }
  let barCount = Math.max(1, Math.ceil(maxTick / patternTicks));
  if (options.maxBars != null) barCount = Math.min(barCount, options.maxBars);

  const sectionBars = options.sectionBars;
  const sectionCount = sectionCountForBars(barCount, sectionBars);
  const chunkSize = sectionCount === 1 ? barCount : sectionBars;

  // Bars are interned by content hash; names are assigned once every bar is known.
  const patternByHash = new Map<string, PatternDef>();
  const prefixByHash = new Map<string, string>();
  const created: PatternDef[] = [];
  let patternsReused = 0;

  function intern(tokens: string[], sourceBarIndex: number, prefix: string): string {
    const hash = hashTokens(tokens);
    if (patternByHash.has(hash)) {
      patternsReused += 1;
      return hash;
    }
    const def: PatternDef = { name: hash, tokens, hash, sourceBarIndex };
    patternByHash.set(hash, def);
    prefixByHash.set(hash, prefix);
    created.push(def);
    return hash;
  }

  const sequences: SequenceDef[] = [];
  const channelPlans: ReuseResult['channelPlans'] = [];

  const sortedChannels = [...channels].sort((a, b) => a.channelIndex - b.channelIndex);

  for (const ch of sortedChannels) {
    const prefix =
      ch.role === 'pulse1'
        ? 'lead'
        : ch.role === 'pulse2'
          ? 'arp'
          : ch.role === 'noise'
            ? 'drums'
            : ch.role === 'dmc'
              ? 'dmc'
              : 'bass';
    const playlist: string[] = [];
    for (let bar = 0; bar < barCount; bar++) {
      const tokens = hitsToBarTokens(ch.hits, bar * patternTicks, patternTicks);
      playlist.push(intern(tokens, bar, prefix));
    }

    const sequenceNames: string[] = [];
    for (let s = 0; s < sectionCount; s++) {
      const start = s * chunkSize;
      const end = Math.min(barCount, start + chunkSize);
      const slice = playlist.slice(start, end);
      const seqName = sectionSeqName(prefix, s, sectionCount, sectionBars);
      sequences.push({ name: seqName, playlist: slice });
      sequenceNames.push(seqName);
    }

    channelPlans.push({
      channelIndex: ch.channelIndex,
      defaultInstrument: ch.defaultInstrument,
      role: ch.role,
      sequenceNames,
    });
  }

  const patterns = namePatterns(created, prefixByHash);
  const nameByHash = new Map(patterns.map((p) => [p.hash, p.name]));
  for (const s of sequences) s.playlist = s.playlist.map((h) => nameByHash.get(h)!);

  diagnostics.push({
    level: 'info',
    code: 'reuse',
    message: `Generated ${barCount} bar(s), ${patterns.length} unique pattern(s), reused ${patternsReused} bar slot(s)`,
  });
  if (sectionCount > 1) {
    diagnostics.push({
      level: 'info',
      code: 'arrangement_sections',
      message: `Emitting ${sectionCount} arrangement section(s) (${chunkSize} bar(s) each, last may be shorter)`,
    });
  }

  return {
    patterns,
    sequences,
    channelPlans,
    barsGenerated: barCount,
    patternsReused,
    sectionCount,
  };
}
