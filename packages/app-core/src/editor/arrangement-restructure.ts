/**
 * Opt-in source transform: channel-grouped phased seq defs → section headers.
 */

import {
  collectPhaseSeqNames,
  detectArrangementLayout,
} from './arrangement-slice.js';

const CHANNEL_LINE_RE = /^\s*channel\s+\d+\s*=>/i;
const SEQ_DEF_LINE_RE = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/i;

export interface RestructurePhasedSectionsResult {
  source: string;
  sectionCount: number;
}

function getAstChannelSpecTokens(astChannel: any): string[] {
  const seqSpec: string[] | undefined = astChannel?.seqSpecTokens;
  if (Array.isArray(seqSpec) && seqSpec.length > 0) {
    return seqSpec.map((s) => String(s)).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof astChannel?.seq === 'string' && astChannel.seq.trim()) {
    return astChannel.seq.split(/\s*,\s*|\s+/).map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}

function phaseCount(ast: any): number {
  const channels: any[] = ast?.channels ?? [];
  return Math.max(
    0,
    ...channels.map((ch) => getAstChannelSpecTokens(ch).length),
  );
}

function extractSeqDefinitionLines(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const match = line.match(SEQ_DEF_LINE_RE);
    if (match) map.set(match[1], line);
  }
  return map;
}

function findSeqDefinitionRegion(lines: string[]): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  let sawChannel = false;
  for (let i = 0; i < lines.length; i++) {
    if (CHANNEL_LINE_RE.test(lines[i])) {
      sawChannel = true;
      break;
    }
    if (SEQ_DEF_LINE_RE.test(lines[i])) {
      if (start < 0) start = i;
      end = i;
    }
  }
  if (start < 0 || !sawChannel) return null;
  return { start, end };
}

function formatPhaseLabel(seqNames: string[], phaseIndex: number): string {
  const suffixes = seqNames.map((name) => {
    const idx = name.lastIndexOf('_');
    return idx >= 0 ? name.slice(idx + 1) : name;
  });
  const first = suffixes[0];
  if (first && suffixes.every((suffix) => suffix === first)) {
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  return `Section ${phaseIndex + 1}`;
}

/** User-facing reason when {@link restructurePhasedSections} cannot run. */
export function explainPhasedRestructureUnavailable(fullSource: string, ast: any): string {
  const layout = detectArrangementLayout(fullSource, ast);
  if (layout === 'structured') {
    return 'Song already has `# --- Section N ---` headers — restructure is not needed.';
  }
  if (layout === 'monolithic') {
    return [
      'Restructure Phased Sections only works on intro/main/bridge channel layouts (e.g. shadow_temple.bax).',
      'This song uses one long seq per channel — split each channel line into multiple seq refs for Pattern Grid sections.',
      'Comment headers alone do not create sections on monolithic songs.',
    ].join(' ');
  }
  if (layout === 'mixed') {
    return 'Channels have different seq counts — align all channels before restructuring.';
  }

  const lines = fullSource.split('\n');
  const region = findSeqDefinitionRegion(lines);
  if (!region) {
    return 'No `seq` definition block found before the `channel` lines.';
  }
  if (phaseCount(ast) < 2) {
    return 'Each channel needs at least two section sequences (e.g. intro + main).';
  }
  return 'Seq definitions could not be matched to channel phases.';
}

/**
 * Rewrite channel-grouped phased seq definitions into `# --- Section N: … ---`
 * blocks with cross-channel seq lines per section. Returns null when not applicable.
 */
export function restructurePhasedSections(
  fullSource: string,
  ast: any,
): RestructurePhasedSectionsResult | null {
  if (detectArrangementLayout(fullSource, ast) !== 'phased') return null;

  const lines = fullSource.split('\n');
  const region = findSeqDefinitionRegion(lines);
  if (!region) return null;

  const seqLines = extractSeqDefinitionLines(lines);
  const phases = phaseCount(ast);
  if (phases < 2) return null;

  const newSeqBlock: string[] = [];
  for (let phase = 0; phase < phases; phase++) {
    const seqNames = collectPhaseSeqNames(ast, phase);
    if (seqNames.length === 0) continue;

    const label = formatPhaseLabel(seqNames, phase);
    newSeqBlock.push(`# --- Section ${phase + 1}: ${label} ---`);
    for (const seqName of seqNames) {
      const defLine = seqLines.get(seqName);
      if (!defLine) return null;
      newSeqBlock.push(defLine);
    }
    newSeqBlock.push('');
  }

  while (newSeqBlock.length > 0 && newSeqBlock[newSeqBlock.length - 1] === '') {
    newSeqBlock.pop();
  }

  const out = [
    ...lines.slice(0, region.start),
    ...newSeqBlock,
    ...lines.slice(region.end + 1),
  ];

  return {
    source: out.join('\n'),
    sectionCount: phases,
  };
}
