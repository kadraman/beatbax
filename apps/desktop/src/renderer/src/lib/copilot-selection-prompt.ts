export interface CopilotEditorReference {
  id: string;
  startLine: number;
  endLine: number;
  /** Short preview for the chip label (resolved afresh from the editor on send). */
  preview: string;
}

export interface CopilotSelectionPromptOptions {
  text: string;
  startLine: number;
  endLine: number;
}

let nextReferenceId = 1;

/** Build a removable editor reference from a line range (full lines, not partial tokens). */
export function createCopilotEditorReference(opts: CopilotSelectionPromptOptions): CopilotEditorReference {
  const { text, startLine, endLine } = opts;
  const firstLine = text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
  const preview = firstLine.length > 52 ? `${firstLine.slice(0, 52)}…` : firstLine;
  return {
    id: `ref-${nextReferenceId++}`,
    startLine,
    endLine,
    preview: preview || (startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}–${endLine}`),
  };
}

/** Chip label shown above the Copilot input. */
export function formatCopilotReferenceLabel(ref: CopilotEditorReference): string {
  return ref.startLine === ref.endLine
    ? `Line ${ref.startLine}`
    : `Lines ${ref.startLine}–${ref.endLine}`;
}

/** Read referenced line ranges from the current editor source. */
export function resolveCopilotReferences(
  refs: CopilotEditorReference[],
  source: string,
): string[] {
  if (refs.length === 0) return [];
  const lines = source.split('\n');
  return refs.map((ref) => {
    const slice = lines.slice(ref.startLine - 1, ref.endLine);
    return slice.join('\n');
  });
}

/** Merge the user's question with referenced editor snippets at send time. */
export function buildUserMessageWithReferences(
  userText: string,
  refs: CopilotEditorReference[],
  source: string,
): string {
  const resolved = resolveCopilotReferences(refs, source);
  const blocks = resolved.map((text, index) => {
    const ref = refs[index];
    const loc = formatCopilotReferenceLabel(ref);
    return `[Referenced editor ${loc}]\n\`\`\`bax\n${text}\n\`\`\``;
  });

  const trimmed = userText.trim();
  if (blocks.length === 0) return trimmed;
  if (!trimmed) return blocks.join('\n\n');
  return `${blocks.join('\n\n')}\n\n${trimmed}`;
}

/** @deprecated Use createCopilotEditorReference + buildUserMessageWithReferences instead. */
export function formatCopilotSelectionPrompt(opts: CopilotSelectionPromptOptions): string {
  const ref = createCopilotEditorReference(opts);
  return buildUserMessageWithReferences('', [ref], opts.text);
}
