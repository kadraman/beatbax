export interface CopilotErrorPromptOptions {
  source?: string;
  line?: number;
  column?: number;
}

/** User-facing prompt prefilled when asking Copilot about a problem row. */
export function formatCopilotErrorPrompt(
  message: string,
  options: CopilotErrorPromptOptions = {},
): string {
  const sourcePrefix = options.source ? `[${options.source}] ` : '';
  const line = options.line ?? 0;
  const column = options.column ?? 1;
  const loc = line > 0 ? ` (line ${line}, col ${column})` : '';
  return `Please explain this error and suggest how to fix it:\n\n${sourcePrefix}${message}${loc}`;
}

/** Plain text copied from a problem row (without the Copilot wrapper). */
export function formatProblemClipboardText(
  message: string,
  options: CopilotErrorPromptOptions = {},
): string {
  const sourcePrefix = options.source ? `[${options.source}] ` : '';
  const line = options.line ?? 0;
  const column = options.column ?? 1;
  const loc = line > 0 ? ` (line ${line}, col ${column})` : '';
  return `${sourcePrefix}${message}${loc}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
