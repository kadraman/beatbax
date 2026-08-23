/** Max characters shown in the applied-edit summary (model may ramble). */
const EXPLANATION_CHAR_LIMIT = 1000;

const FENCE_RE = /```[\s\S]*?```/g;
const FILLER_LINE_RE = /^(here'?s|here is|below is|sure[,.]?|ok[,.]?)\s+(the\s+)?(updated|full|complete|new)?\s*(song|file|code)\s*:?\.?\s*$/i;

function looksLikeSongDump(text: string): boolean {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const songLines = lines.filter((line) => (
    /^(chip|bpm|inst|pat|seq|channel|play|effect|time|stepsPerBar|#)\b/.test(line)
  ));
  return songLines.length >= 2 && songLines.length / lines.length >= 0.6;
}

function normalizeExplanation(text: string): string {
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !FILLER_LINE_RE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned || looksLikeSongDump(cleaned)) return '';
  if (cleaned.length <= EXPLANATION_CHAR_LIMIT) return cleaned;
  return `${cleaned.slice(0, EXPLANATION_CHAR_LIMIT - 1).trimEnd()}…`;
}

/**
 * Pulls the model's what/why prose out of an Edit reply, ignoring ```bax fences.
 */
export function extractEditExplanation(content: string): string {
  if (!content.trim()) return '';
  return normalizeExplanation(content.replace(FENCE_RE, '\n'));
}

/**
 * Wraps BeatBax note tokens and `pat`/`seq`/`inst`/`effect` names in backticks
 * so they render as inline code. Leaves existing `code` and fenced blocks alone.
 */
export function wrapBaxTokensForMarkdown(text: string): string {
  if (!text) return text;
  return text.replace(/(```[\s\S]*?```)|(`[^`]*`)|([^`]+)/g, (chunk, fence: string | undefined, inline: string | undefined, prose: string | undefined) => {
    if (fence || inline || !prose) return chunk;
    return prose
      .replace(/\b([A-G][#b]?\d+(?:<[^>\n]{1,48}>)?(?::\d+|\/\d+)?)\b/g, '`$1`')
      .replace(/\b((?:pat|seq|inst|effect)\s+[A-Za-z_]\w*)\b/g, '`$1`');
  });
}
