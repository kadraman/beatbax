/**
 * Lightweight Help-panel snippet highlighting for BeatBax `#` line comments.
 * Matches Monaco tokenizer behaviour: from the first `#` to end of line is a comment.
 */

export type HelpSnippetSpan = {
  text: string;
  kind: 'code' | 'comment';
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tokenize one source line into code / comment spans. */
export function tokenizeHelpSnippetLine(line: string): HelpSnippetSpan[] {
  const idx = line.indexOf('#');
  if (idx === -1) return [{ text: line, kind: 'code' }];
  if (idx === 0) return [{ text: line, kind: 'comment' }];
  return [
    { text: line.slice(0, idx), kind: 'code' },
    { text: line.slice(idx), kind: 'comment' },
  ];
}

/** Tokenize a full snippet (normalized newlines) into per-line span lists. */
export function tokenizeHelpSnippet(code: string): HelpSnippetSpan[][] {
  return code.replace(/\r\n?/g, '\n').split('\n').map(tokenizeHelpSnippetLine);
}

/**
 * Escape a Help snippet to HTML, wrapping `#…` comments in
 * `<span class="bb-help__comment">…</span>`.
 */
export function formatHelpSnippetHtml(code: string): string {
  return tokenizeHelpSnippet(code)
    .map((spans) =>
      spans
        .map((span) => {
          const escaped = escapeHtml(span.text);
          return span.kind === 'comment'
            ? `<span class="bb-help__comment">${escaped}</span>`
            : escaped;
        })
        .join(''),
    )
    .join('\n');
}
