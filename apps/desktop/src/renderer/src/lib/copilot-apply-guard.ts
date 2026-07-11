/**
 * Guards Edit-mode apply: reject model output that looks like a partial snippet
 * when the editor already contains a full song (would wipe most of the file).
 */

export interface SongAnchors {
  hasChip: boolean;
  hasBpm: boolean;
  hasPlay: boolean;
  channelCount: number;
  instrumentCount: number;
  patternCount: number;
  sequenceCount: number;
}

export interface ApplyGuardResult {
  ok: boolean;
  /** User-facing reason when ok is false. */
  reason?: string;
}

/** Counts structural BeatBax definitions in source text. */
export function detectSongAnchors(content: string): SongAnchors {
  let hasChip = false;
  let hasBpm = false;
  let hasPlay = false;
  let channelCount = 0;
  let instrumentCount = 0;
  let patternCount = 0;
  let sequenceCount = 0;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (/^chip\s+\S+/.test(line)) hasChip = true;
    else if (/^bpm\s+\S+/.test(line)) hasBpm = true;
    else if (/^play\b/.test(line)) hasPlay = true;
    else if (/^channel\s+\d+\s*=>/.test(line)) channelCount += 1;
    else if (/^inst\s+[A-Za-z_]\w*\b/.test(line)) instrumentCount += 1;
    else if (/^pat\s+[A-Za-z_]\w*\s*=/.test(line)) patternCount += 1;
    else if (/^seq\s+[A-Za-z_]\w*\s*=/.test(line)) sequenceCount += 1;
  }

  return {
    hasChip,
    hasBpm,
    hasPlay,
    channelCount,
    instrumentCount,
    patternCount,
    sequenceCount,
  };
}

/** Non-empty, non-comment lines (metadata `#` headers count as substantive). */
export function countSubstantiveLines(content: string): number {
  return content.split('\n').filter((raw) => {
    const line = raw.trim();
    return line.length > 0 && !line.startsWith('//');
  }).length;
}

function totalDefinitions(anchors: SongAnchors): number {
  return anchors.instrumentCount
    + anchors.patternCount
    + anchors.sequenceCount
    + anchors.channelCount;
}

function looksLikeFullSong(anchors: SongAnchors, substantiveLines: number): boolean {
  if (anchors.hasPlay) return true;
  if (anchors.channelCount >= 2) return true;
  if (anchors.channelCount >= 1 && anchors.patternCount >= 3) return true;
  if (substantiveLines >= 25 && anchors.patternCount >= 2) return true;
  return false;
}

/**
 * Returns whether it is safe to replace `previous` editor content with `candidate`
 * from an Edit-mode Copilot response.
 */
export function assessEditApplyGuard(previous: string, candidate: string): ApplyGuardResult {
  const prev = previous.trim();
  const cand = candidate.trim();
  if (!prev) return { ok: true };
  if (!cand) {
    return { ok: false, reason: 'Copilot returned empty BeatBax — the editor was not changed.' };
  }

  const prevAnchors = detectSongAnchors(prev);
  const candAnchors = detectSongAnchors(cand);
  const prevLines = countSubstantiveLines(prev);
  const candLines = countSubstantiveLines(cand);

  if (!looksLikeFullSong(prevAnchors, prevLines)) {
    // Short scratch buffer — allow compact replies.
    return { ok: true };
  }

  if (prevAnchors.hasPlay && !candAnchors.hasPlay) {
    return {
      ok: false,
      reason: 'Copilot returned a fragment without a `play` directive. Edit mode requires the **full updated song**, not a single pattern line.',
    };
  }

  if (prevAnchors.channelCount >= 1 && candAnchors.channelCount === 0) {
    return {
      ok: false,
      reason: 'Copilot returned a fragment without `channel` mappings. Edit mode requires the **full updated song**, not a snippet.',
    };
  }

  if (prevAnchors.hasChip && !candAnchors.hasChip) {
    return {
      ok: false,
      reason: 'Copilot returned a fragment without the `chip` line. Edit mode requires the **full updated song**.',
    };
  }

  const minLines = Math.max(8, Math.floor(prevLines * 0.45));
  if (prevLines >= 20 && candLines < minLines) {
    return {
      ok: false,
      reason: `Copilot returned only ${candLines} line${candLines === 1 ? '' : 's'} but your song has ${prevLines}. This looks like a snippet, not the full file — the editor was not changed. Try a larger model or raise Ollama \`num_ctx\` (see docs/features/copilot-local-ollama.md).`,
    };
  }

  const prevDefs = totalDefinitions(prevAnchors);
  const candDefs = totalDefinitions(candAnchors);
  if (prevDefs >= 8 && candDefs <= 2) {
    return {
      ok: false,
      reason: 'Copilot dropped most instruments, patterns, and channels — the response is incomplete. The editor was not changed.',
    };
  }

  if (prevAnchors.instrumentCount >= 2 && candAnchors.instrumentCount < Math.ceil(prevAnchors.instrumentCount * 0.5)) {
    return {
      ok: false,
      reason: 'Copilot returned far fewer instrument definitions than your song. The editor was not changed.',
    };
  }

  return { ok: true };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * When the model returns a single `pat` / `seq` line, merge it into the open song
 * instead of replacing the whole editor. Returns null if merge is not possible.
 */
export function tryMergeSnippetIntoSong(previous: string, candidate: string): string | null {
  const defLines = candidate.split('\n')
    .map((raw) => raw.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && /^(pat|seq)\s+[A-Za-z_]\w*\s*=/.test(line));
  if (defLines.length !== 1) return null;

  const defLine = defLines[0];
  const patMatch = defLine.match(/^pat\s+([A-Za-z_]\w*)\s*=/);
  const seqMatch = defLine.match(/^seq\s+([A-Za-z_]\w*)\s*=/);
  const name = patMatch?.[1] ?? seqMatch?.[1];
  const kind = patMatch ? 'pat' : 'seq';
  if (!name) return null;

  const lineRe = new RegExp(`^(\\s*)${kind}\\s+${escapeRegex(name)}\\s*=.*$`, 'm');
  if (!lineRe.test(previous)) return null;

  return previous.replace(lineRe, (_match, indent: string) => {
    const body = defLine.replace(/^\s*(pat|seq)\s+/, '');
    return `${indent ?? ''}${kind} ${body}`;
  });
}

/** Follow-up prompt when the model returned a snippet instead of the full song. */
export function buildIncompleteSongRepairPrompt(
  userRequest: string,
  previousSong: string,
  fragment: string,
  reason: string,
): string {
  return [
    'Your previous reply was rejected because it was incomplete:',
    reason,
    '',
    `Original user request: ${userRequest.trim()}`,
    '',
    'Return ONLY the **complete** updated song as a single ```bax fenced code block — no prose.',
    'Include metadata, chip, bpm, every instrument, every pattern, every sequence, every channel, and play.',
    'Change only what the user asked for; copy all other lines verbatim from the current song.',
    'Do NOT return just the one definition you changed.',
    '',
    'Current song (return this entire file with your edit applied):',
    '```bax',
    previousSong,
    '```',
    '',
    'Incomplete fragment you sent (too short — do NOT reply with only this):',
    '```bax',
    fragment,
    '```',
  ].join('\n');
}
