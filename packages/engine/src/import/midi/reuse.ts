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

export interface ReuseResult {
  patterns: PatternDef[];
  sequences: SequenceDef[];
  channelPlans: { channelIndex: number; defaultInstrument: string; role: PackedChannel['role']; sequenceName: string }[];
  barsGenerated: number;
  patternsReused: number;
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
      maxTick = Math.max(maxTick, h.startTick + h.durationTicks);
    }
  }
  let barCount = Math.max(1, Math.ceil(maxTick / patternTicks));
  if (options.maxBars != null) barCount = Math.min(barCount, options.maxBars);

  // Shared rest pattern
  const patternByHash = new Map<string, PatternDef>();
  const patterns: PatternDef[] = [];
  let patternsReused = 0;
  let restPattern: PatternDef | null = null;

  function intern(tokens: string[], sourceBarIndex: number, prefix: string): string {
    const hash = hashTokens(tokens);
    const existing = patternByHash.get(hash);
    if (existing) {
      patternsReused += 1;
      return existing.name;
    }
    const name = `${prefix}_${hash}`;
    const def: PatternDef = { name, tokens, hash, sourceBarIndex };
    patternByHash.set(hash, def);
    patterns.push(def);
    if (isRestOnly(tokens) && !restPattern) restPattern = def;
    return name;
  }

  const sequences: SequenceDef[] = [];
  const channelPlans: ReuseResult['channelPlans'] = [];

  const sortedChannels = [...channels].sort((a, b) => a.channelIndex - b.channelIndex);

  for (const ch of sortedChannels) {
    const prefix = ch.role === 'pulse1' ? 'lead' : ch.role === 'pulse2' ? 'arp' : ch.role === 'noise' ? 'drums' : ch.role === 'dmc' ? 'dmc' : 'bass';
    const playlist: string[] = [];
    for (let bar = 0; bar < barCount; bar++) {
      const tokens = hitsToBarTokens(ch.hits, bar * patternTicks, patternTicks);
      playlist.push(intern(tokens, bar, prefix));
    }
    const seqName = `${prefix}_seq`;
    sequences.push({ name: seqName, playlist });
    channelPlans.push({
      channelIndex: ch.channelIndex,
      defaultInstrument: ch.defaultInstrument,
      role: ch.role,
      sequenceName: seqName,
    });
  }

  diagnostics.push({
    level: 'info',
    code: 'reuse',
    message: `Generated ${barCount} bar(s), ${patterns.length} unique pattern(s), reused ${patternsReused} bar slot(s)`,
  });

  return {
    patterns,
    sequences,
    channelPlans,
    barsGenerated: barCount,
    patternsReused,
  };
}
