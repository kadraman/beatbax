/** Edit-mode prompt that asks for a minimal full-song fix instead of a broad rewrite. */
export function buildMinimalEditFixPrompt(snippet?: string, assistantContext?: string): string {
  if (snippet?.trim()) {
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
  return [
    'Apply only the minimal fix needed based on your previous explanation.',
    'Return the complete updated song in a single ```bax code block.',
    'Change only what is necessary; copy all other lines verbatim from the current song.',
    excerpt ? `\nReference:\n${excerpt}` : '',
  ].join('\n');
}
