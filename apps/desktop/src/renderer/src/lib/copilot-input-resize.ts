export const COPILOT_INPUT_MIN_ROWS = 2;
export const COPILOT_INPUT_MAX_ROWS = 8;

/** Grow/shrink a Copilot textarea with content, up to maxRows (VS Code-style). */
export function adjustCopilotInputHeight(
  textarea: HTMLTextAreaElement | null,
  minRows = COPILOT_INPUT_MIN_ROWS,
  maxRows = COPILOT_INPUT_MAX_ROWS,
): void {
  if (!textarea) return;

  const style = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight) || 18;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
  const verticalChrome = paddingTop + paddingBottom + borderTop + borderBottom;
  const minHeight = lineHeight * minRows + verticalChrome;
  const maxHeight = lineHeight * maxRows + verticalChrome;

  textarea.style.height = 'auto';
  const contentHeight = textarea.scrollHeight;
  const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
}
