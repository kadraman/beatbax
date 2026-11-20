import { collectSectionMarkers, extractSectionMarkers } from './copilot-apply-guard';
import { isArrangementLayoutFixIntent } from './copilot-arrangement-fix';

/**
 * Whether an Ask-mode prose reply should show **Fix in Edit mode**.
 * Pure Q&A (e.g. "explain this song") must not get a fix CTA. Offer it only when
 * the reply has an actionable layout/section cue. Fenced ```bax``` blocks use
 * their own **Apply fix in Edit mode** actions instead.
 */
export function shouldOfferAskFixInEditMode(assistantContent: string | undefined): boolean {
  const text = assistantContent?.trim() ?? '';
  if (!text) return false;
  if (collectSectionMarkers(undefined, text).length > 0) return true;
  if (isArrangementLayoutFixIntent(text)) return true;
  return false;
}

/** Edit-mode prompt that asks for a minimal full-song fix instead of a broad rewrite. */
export function buildMinimalEditFixPrompt(snippet?: string, assistantContext?: string): string {
  if (snippet?.trim()) {
    const markers = extractSectionMarkers(snippet);
    const substantive = snippet.split('\n').map((line) => line.trim()).filter(Boolean);
    if (markers.length > 0 && markers.length === substantive.length) {
      return [
        'Insert these section marker comments into the current song immediately before the first `seq` definition.',
        'Return the **complete** updated song in a single ```bax code block (chip through play).',
        'Do not change any music — only add the comment lines.',
        '',
        'Markers to add:',
        '```bax',
        markers.join('\n'),
        '```',
      ].join('\n');
    }

    return [
      'Apply only the minimal fix needed to resolve the issue we discussed.',
      'Return the complete updated song in a single ```bax code block.',
      'Change only what is necessary; copy all other lines verbatim from the current song.',
      '',
      'Suggested fix:',
      '```bax',
      snippet.trim(),
      '```',
    ].join('\n');
  }

  const excerpt = assistantContext?.trim().slice(0, 2000) ?? '';
  const markers = collectSectionMarkers(snippet, assistantContext);
  if (markers.length > 0) {
    return [
      'Based on your previous explanation, add these `# --- Section N: … ---` comment lines to improve section focus.',
      'Insert them immediately before the first `seq` definition.',
      'Return the **complete** updated song in a single ```bax code block.',
      'Change only comments — copy all musical lines verbatim.',
      '',
      'Markers:',
      markers.join('\n'),
      excerpt ? `\nReference:\n${excerpt}` : '',
    ].join('\n');
  }

  return [
    'Apply only the minimal fix needed based on your previous explanation.',
    'Return the complete updated song in a single ```bax code block.',
    'Change only what is necessary; copy all other lines verbatim from the current song.',
    excerpt ? `\nReference:\n${excerpt}` : '',
  ].join('\n');
}
