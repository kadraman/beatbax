/**
 * Split one long seq per channel into aligned section seqs for Pattern Grid focus.
 */

import { detectArrangementLayout } from './arrangement-slice.js';

const CHANNEL_LINE_RE = /^\s*channel\s+(\d+)\s*=>\s*inst\s+(\S+)\s+seq\s+(\S+)(.*)$/i;
const SEQ_DEF_LINE_RE = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export interface MonolithicSectionSplit {
  label: string;
  tokenCount: number;
}

export interface SplitMonolithicSectionsResult {
  source: string;
  sectionCount: number;
}

/** battle_fanfare.bax slot map (4+4+4+5+2 = 19 patterns per channel). */
export const BATTLE_FANFARE_SECTION_SPLITS: MonolithicSectionSplit[] = [
  { label: 'Fanfare', tokenCount: 4 },
  { label: 'Theme A', tokenCount: 4 },
  { label: 'Theme B', tokenCount: 4 },
  { label: 'Transition + Reprise', tokenCount: 5 },
  { label: 'Outro', tokenCount: 2 },
];

function getAstChannelSpecTokens(astChannel: any): string[] {
  const seqSpec: string[] | undefined = astChannel?.seqSpecTokens;
  if (Array.isArray(seqSpec) && seqSpec.length > 0) {
    return seqSpec.map((s) => String(s)).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function slugifySectionLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function tokenizeSeqBody(body: string): string[] {
  const raw: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (/\s/.test(ch) && depth === 0) {
      if (current.trim()) raw.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) raw.push(current.trim());
  return mergeSpacedRepetitionTokens(raw);
}

/** Attach top-level `* N` suffixes to the preceding seq reference (supports `name*2` and `name * 2`). */
function mergeSpacedRepetitionTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '*' && i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
      if (out.length === 0) {
        out.push(`*${tokens[i + 1]}`);
      } else {
        out[out.length - 1] = `${out[out.length - 1]}*${tokens[i + 1]}`;
      }
      i += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

function parseSeqDefinitions(lines: string[]): Map<string, { lineIndex: number; tokens: string[] }> {
  const map = new Map<string, { lineIndex: number; tokens: string[] }>();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SEQ_DEF_LINE_RE);
    if (!match) continue;
    map.set(match[1], { lineIndex: i, tokens: tokenizeSeqBody(match[2]) });
  }
  return map;
}

function findSeqDefinitionRegion(lines: string[]): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CHANNEL_LINE_RE.test(lines[i])) break;
    if (SEQ_DEF_LINE_RE.test(lines[i])) {
      if (start < 0) start = i;
      end = i;
    }
  }
  if (start < 0) return null;
  return { start, end };
}

function deriveSectionSeqName(seqName: string, slug: string): string {
  if (seqName.endsWith('_main')) {
    return `${seqName.slice(0, -'_main'.length)}_${slug}`;
  }
  const underscore = seqName.lastIndexOf('_');
  const base = underscore >= 0 ? seqName.slice(0, underscore) : seqName;
  return `${base}_${slug}`;
}

function inferSectionSplits(fullSource: string, ast: any): MonolithicSectionSplit[] | null {
  const channels: any[] = ast?.channels ?? [];
  if (channels.length === 0) return null;

  const seqNames = channels.map((ch) => getAstChannelSpecTokens(ch)[0]).filter(Boolean);
  if (seqNames.length !== channels.length) return null;
  if (!seqNames.every((name) => name.endsWith('_main'))) return null;

  const seqDefs = parseSeqDefinitions(fullSource.split('\n'));
  const lengths = seqNames.map((name) => seqDefs.get(name)?.tokens.length ?? 0);
  if (lengths.some((len) => len === 0)) return null;
  const unique = [...new Set(lengths)];
  if (unique.length !== 1) return null;

  const total = unique[0];
  const battleTotal = BATTLE_FANFARE_SECTION_SPLITS.reduce((sum, section) => sum + section.tokenCount, 0);
  if (total === battleTotal) return BATTLE_FANFARE_SECTION_SPLITS;

  return null;
}

/** User-facing reason when {@link splitMonolithicChannelSeqs} cannot run. */
export function explainMonolithicSplitUnavailable(fullSource: string, ast: any): string {
  const normalized = fullSource.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const layout = detectArrangementLayout(normalized, ast);
  if (layout !== 'monolithic') {
    return 'Split Monolithic Sections only works when each channel has one top-level `seq` reference.';
  }
  if (!inferSectionSplits(normalized, ast)) {
    return [
      'Could not infer section boundaries for this monolithic song.',
      'Split each channel `seq` manually into aligned section sequences, or use a song with the battle_fanfare slot layout (19 patterns per channel).',
    ].join(' ');
  }
  return 'Song is already split or section boundaries could not be applied.';
}

/**
 * Rewrite monolithic `*_main` channel seqs into cross-channel section blocks.
 * Currently supports the 19-pattern battle_fanfare section map.
 */
export function splitMonolithicChannelSeqs(
  fullSource: string,
  ast: any,
  sections?: MonolithicSectionSplit[],
): SplitMonolithicSectionsResult | null {
  if (detectArrangementLayout(fullSource, ast) !== 'monolithic') return null;

  const normalized = fullSource.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const resolvedSections = sections ?? inferSectionSplits(normalized, ast);
  if (!resolvedSections || resolvedSections.length === 0) return null;

  const sectionTokenTotal = resolvedSections.reduce((sum, section) => sum + section.tokenCount, 0);
  const channels: any[] = ast?.channels ?? [];
  const channelSeqs = channels.map((ch) => {
    const tokens = getAstChannelSpecTokens(ch);
    if (tokens.length !== 1) return null;
    return { channelId: Number(ch?.id ?? 0), seqName: tokens[0] };
  });
  if (channelSeqs.some((entry) => entry === null)) return null;

  const lines = normalized.split('\n');
  const region = findSeqDefinitionRegion(lines);
  if (!region) return null;

  const seqDefs = parseSeqDefinitions(lines);
  const channelPlans = channelSeqs.map((entry) => {
    const def = seqDefs.get(entry!.seqName);
    if (!def) return null;
    if (def.tokens.length !== sectionTokenTotal) return null;
    return { ...entry!, tokens: def.tokens, lineIndex: def.lineIndex };
  });
  if (channelPlans.some((plan) => plan === null)) return null;

  const removeLineIndices = new Set(channelPlans.map((plan) => plan!.lineIndex));
  const newSeqBlock: string[] = [];
  let cursor = 0;
  for (let sectionIndex = 0; sectionIndex < resolvedSections.length; sectionIndex++) {
    const section = resolvedSections[sectionIndex];
    const slug = slugifySectionLabel(section.label);
    newSeqBlock.push(`# --- Section ${sectionIndex + 1}: ${section.label} ---`);
    for (const plan of channelPlans) {
      const slice = plan!.tokens.slice(cursor, cursor + section.tokenCount);
      if (slice.length !== section.tokenCount) return null;
      const nextName = deriveSectionSeqName(plan!.seqName, slug);
      newSeqBlock.push(`seq ${nextName} = ${slice.join(' ')}`);
    }
    newSeqBlock.push('');
    cursor += section.tokenCount;
  }
  while (newSeqBlock.length > 0 && newSeqBlock[newSeqBlock.length - 1] === '') {
    newSeqBlock.pop();
  }

  const sectionSeqNames = resolvedSections.map((section) => slugifySectionLabel(section.label));
  const preservedMiddle = lines
    .slice(region.start, region.end + 1)
    .filter((_, offset) => !removeLineIndices.has(region.start + offset));
  const out = [
    ...lines.slice(0, region.start),
    ...newSeqBlock,
    ...preservedMiddle,
    ...lines.slice(region.end + 1),
  ];

  for (let i = 0; i < out.length; i++) {
    const match = out[i].match(CHANNEL_LINE_RE);
    if (!match) continue;
    const plan = channelPlans.find((entry) => entry!.channelId === Number(match[1]));
    if (!plan) continue;
    const seqList = sectionSeqNames
      .map((slug) => deriveSectionSeqName(plan.seqName, slug))
      .join(' ');
    out[i] = `channel ${match[1]} => inst ${match[2]} seq ${seqList}${match[4] ?? ''}`;
  }

  return {
    source: out.join('\n'),
    sectionCount: resolvedSections.length,
  };
}
