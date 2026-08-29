/**
 * Insert `# --- Section N: … ---` comment headers for arrangement layout hints.
 */

const SECTION_MARKER_LINE_RE = /^\s*#\s*---\s*Section\s+\d+:/i;
const SEQ_DEF_LINE_RE = /^\s*seq\s+[A-Za-z_]\w*\s*=/;
const CHANNEL_LINE_RE = /^\s*channel\s+\d+\s*=>/;

export type SectionMarkerMergeResult =
  | { status: 'applied'; song: string }
  | { status: 'already' }
  | { status: 'no_markers' }
  | { status: 'failed'; reason: string };

export const DEFAULT_SECTION_MARKERS = [
  '# --- Section 1: Fanfare ---',
  '# --- Section 2: Theme A ---',
  '# --- Section 3: Theme B ---',
  '# --- Section 4: Transition ---',
  '# --- Section 5: Outro ---',
] as const;

function normalizeMarkerLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

function markerAlreadyInSource(source: string, marker: string): boolean {
  const target = normalizeMarkerLine(marker);
  return source.split('\n').some((line) => normalizeMarkerLine(line) === target);
}

/** Pull `# --- Section N: …` marker lines from prose or fenced blocks. */
export function extractSectionMarkers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (line: string): void => {
    const trimmed = line.trim();
    if (!SECTION_MARKER_LINE_RE.test(trimmed)) return;
    const normalized = normalizeMarkerLine(trimmed);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    found.push(trimmed);
  };

  for (const raw of text.split('\n')) add(raw);
  for (const match of text.matchAll(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/g)) {
    for (const raw of match[1].split('\n')) add(raw);
  }
  return found;
}

/** Collect unique section markers from one or more Copilot text sources. */
export function collectSectionMarkers(...texts: Array<string | undefined>): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text?.trim()) continue;
    for (const marker of extractSectionMarkers(text)) {
      const normalized = normalizeMarkerLine(marker);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      found.push(marker);
    }
  }
  return found;
}

function findSeqGroupStartIndices(lines: string[]): number[] {
  const starts: number[] = [];
  let inGroup = false;
  for (let i = 0; i < lines.length; i++) {
    if (SEQ_DEF_LINE_RE.test(lines[i])) {
      if (!inGroup) {
        starts.push(i);
        inGroup = true;
      }
      continue;
    }
    if (inGroup && lines[i].trim() === '') inGroup = false;
  }
  return starts;
}

function findSectionMarkerAnchorLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (SEQ_DEF_LINE_RE.test(lines[i])) return i;
  }
  for (let i = 0; i < lines.length; i++) {
    if (CHANNEL_LINE_RE.test(lines[i])) return i;
  }
  return -1;
}

function insertLinesAt(lines: string[], index: number, block: string[]): string[] {
  return [
    ...lines.slice(0, index),
    ...block,
    ...lines.slice(index),
  ];
}

/**
 * Insert suggested section marker comments into the song.
 * For phased layouts, one marker is placed before each seq group when counts align.
 */
export function tryMergeSectionMarkersIntoSong(
  previous: string,
  candidate: string | string[],
): string | null {
  const markers = Array.isArray(candidate) ? candidate : extractSectionMarkers(candidate);
  if (markers.length === 0) return null;

  const missing = markers.filter((marker) => !markerAlreadyInSource(previous, marker));
  if (missing.length === 0) return previous;

  const lines = previous.split('\n');
  const groupStarts = findSeqGroupStartIndices(lines);
  const anchor = findSectionMarkerAnchorLine(lines);
  if (anchor < 0) return null;

  if (groupStarts.length >= 2 && missing.length > 1) {
    const placements: Array<{ index: number; marker: string }> = [];
    const groupCount = groupStarts.length;
    for (let i = 0; i < missing.length; i++) {
      const groupIndex = Math.min(i, groupCount - 1);
      placements.push({ index: groupStarts[groupIndex], marker: missing[i] });
    }

    placements.sort((a, b) => b.index - a.index);
    let next = lines;
    for (const { index, marker } of placements) {
      const indent = next[index].match(/^(\s*)/)?.[1] ?? '';
      next = insertLinesAt(next, index, [`${indent}${marker.replace(/^\s+/, '')}`]);
    }
    return next.join('\n');
  }

  const indent = lines[anchor].match(/^(\s*)/)?.[1] ?? '';
  const block = missing.map((marker) => `${indent}${marker.replace(/^\s+/, '')}`);
  return insertLinesAt(lines, anchor, block).join('\n');
}

export function mergeSectionMarkersFromCopilotTexts(
  previous: string,
  ...texts: Array<string | undefined>
): SectionMarkerMergeResult {
  const markers = collectSectionMarkers(...texts);
  if (markers.length === 0) return { status: 'no_markers' };

  const missing = markers.filter((marker) => !markerAlreadyInSource(previous, marker));
  if (missing.length === 0) return { status: 'already' };

  const merged = tryMergeSectionMarkersIntoSong(previous, markers);
  if (!merged || merged === previous) {
    return {
      status: 'failed',
      reason: 'Could not find a `seq` or `channel` block to anchor section markers.',
    };
  }
  return { status: 'applied', song: merged };
}

/** Insert starter section header comments (edit labels to match your song). */
export function addDefaultSectionMarkers(source: string): SectionMarkerMergeResult {
  return mergeSectionMarkersFromCopilotTexts(source, ...DEFAULT_SECTION_MARKERS);
}
