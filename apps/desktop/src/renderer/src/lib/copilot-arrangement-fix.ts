/**
 * Local-only fixes for arrangement layout diagnostics (section markers / phased restructure).
 * Avoids full-song Edit-mode AI round-trips on large files.
 */

import { detectArrangementLayout } from '@beatbax/app-core/editor/arrangement-slice';
import { restructurePhasedSections } from '@beatbax/app-core/editor/arrangement-restructure';
import { splitMonolithicChannelSeqs } from '@beatbax/app-core/editor/arrangement-monolithic-split';
import { parseWithPeggy } from '@beatbax/engine/parser';
import {
  collectSectionMarkers,
  mergeSectionMarkersFromCopilotTexts,
} from './copilot-apply-guard';

export type ArrangementLayoutFixAction =
  | 'split_monolithic'
  | 'restructure_phased'
  | 'add_section_markers';

export type ArrangementLayoutFixResult =
  | { status: 'applied'; song: string; message: string; action: ArrangementLayoutFixAction }
  | { status: 'already'; message: string }
  | {
    status: 'proposed';
    action: ArrangementLayoutFixAction;
    commandLabel: string;
    explanation: string;
  }
  | { status: 'not_applicable' };

const ARRANGEMENT_FIX_INTENT_RE = /\b(?:section\s+(?:marker|header|focus)|phased\s+layout|restructure\s+phased|apply\s+(?:the\s+)?(?:suggested\s+)?fix|apply\s+this\s+change|add\s+(?:the\s+)?#?\s*---\s*section|split\s+(?:channel\s+)?seq|refactor.*section|section\s+focus\s+works|per-section\s+preview)/i;
const MINIMAL_EDIT_MARKER_PROMPT_RE = /section marker comments|# --- Section \d+:/i;
const ARRANGEMENT_FIX_CONFIRM_RE = /\b(?:yes|yep|yeah|ok(?:ay)?|sure|please\s+run|run\s+(?:it|split|restructure|command|locally)|go\s+ahead|do\s+it|confirm|apply\s+split|split\s+monolithic|restructure\s+phased)\b/i;

const COMMAND_LABELS: Record<ArrangementLayoutFixAction, string> = {
  split_monolithic: 'BeatBax: Split Monolithic Channel Sequences',
  restructure_phased: 'BeatBax: Restructure Phased Sections',
  add_section_markers: 'BeatBax: Add Section Header Comments',
};

function parseSong(source: string): { ast: any } {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return parseWithPeggy(normalized);
}

/** True when user/Copilot text is trying to apply an arrangement layout fix. */
export function isArrangementLayoutFixIntent(...texts: Array<string | undefined>): boolean {
  return texts.some((text) => {
    if (!text?.trim()) return false;
    return ARRANGEMENT_FIX_INTENT_RE.test(text) || MINIMAL_EDIT_MARKER_PROMPT_RE.test(text);
  });
}

/** True when the user is confirming a proposed local command run. */
export function isArrangementLayoutFixConfirmation(...texts: Array<string | undefined>): boolean {
  return texts.some((text) => text?.trim() && ARRANGEMENT_FIX_CONFIRM_RE.test(text));
}

function buildProposal(
  action: ArrangementLayoutFixAction,
  details: string,
): { action: ArrangementLayoutFixAction; commandLabel: string; explanation: string } {
  const commandLabel = COMMAND_LABELS[action];
  const explanation = [
    details,
    '',
    '### Run it yourself (command palette)',
    `1. Press **F1** (or **Ctrl+Alt+P**) to open the command palette.`,
    `2. Search for **${commandLabel}**.`,
    '3. Run the command, review the diff in the editor, then save.',
    '',
    '### Or let Copilot run it locally',
    'This uses BeatBax\'s built-in transform — **not** an AI rewrite of the whole song.',
    `Click **Run command locally** on this message, or reply **yes, run it**.`,
  ].join('\n');
  return { action, commandLabel, explanation };
}

function applyPhasedRestructure(previous: string, ast: any): ArrangementLayoutFixResult | null {
  if (detectArrangementLayout(previous, ast) !== 'phased') return null;
  const restructured = restructurePhasedSections(previous, ast);
  if (!restructured) return null;
  if (restructured.source === previous) {
    return { status: 'already', message: 'Section headers are already in the editor.' };
  }
  return {
    status: 'applied',
    song: restructured.source,
    action: 'restructure_phased',
    message: `Ran **${COMMAND_LABELS.restructure_phased}** locally — restructured ${restructured.sectionCount} phased section(s). Review and save.`,
  };
}

function applyMonolithicSplit(previous: string, ast: any): ArrangementLayoutFixResult | null {
  if (detectArrangementLayout(previous, ast) !== 'monolithic') return null;
  const split = splitMonolithicChannelSeqs(previous, ast);
  if (!split) return null;
  if (split.source === previous) {
    return { status: 'already', message: 'Channel sequences are already split for section focus.' };
  }
  return {
    status: 'applied',
    song: split.source,
    action: 'split_monolithic',
    message: `Ran **${COMMAND_LABELS.split_monolithic}** locally — split ${split.sectionCount} section seq group(s). Review and save.`,
  };
}

function applySectionMarkers(previous: string, ...contextTexts: Array<string | undefined>): ArrangementLayoutFixResult | null {
  const markerMerge = mergeSectionMarkersFromCopilotTexts(previous, ...contextTexts);
  if (markerMerge.status === 'applied') {
    return {
      status: 'applied',
      song: markerMerge.song,
      action: 'add_section_markers',
      message: `Ran **${COMMAND_LABELS.add_section_markers}** locally — added section header comments. Review and save.`,
    };
  }
  if (markerMerge.status === 'already') {
    return { status: 'already', message: 'Section markers are already in the editor.' };
  }
  return null;
}

function proposeForLayout(
  previous: string,
  ast: any,
  layout: ReturnType<typeof detectArrangementLayout>,
  ...contextTexts: Array<string | undefined>
): ArrangementLayoutFixResult | null {
  if (layout === 'monolithic') {
    const split = splitMonolithicChannelSeqs(previous, ast);
    if (!split || split.source === previous) return null;
    return {
      status: 'proposed',
      ...buildProposal(
        'split_monolithic',
        [
          '## Split channel sequences for Pattern Grid section focus',
          '',
          'This song has **one long `seq` per channel**, so section focus plays the whole timeline.',
          '',
          'BeatBax can split each channel into aligned section sequences (${split.sectionCount} groups) so the Pattern Grid section lane and slice playback work.',
          '',
          '**Edit mode cannot safely rewrite this file with AI** — it is too large for a full-song reply.',
        ].join('\n'),
      ),
    };
  }

  if (layout === 'phased' && restructurePhasedSections(previous, ast)) {
    const sectionCount = restructurePhasedSections(previous, ast)!.sectionCount;
    return {
      status: 'proposed',
      ...buildProposal(
        'restructure_phased',
        [
          '## Restructure phased sections with cross-channel headers',
          '',
          'This song uses a **phased** layout (matching `seq` tokens per channel).',
          `BeatBax can rewrite it into **${sectionCount}** \`# --- Section N ---\` block(s)`,
          'with cross-channel `seq` lines for richer section-focus highlighting.',
        ].join('\n'),
      ),
    };
  }

  const markers = collectSectionMarkers(...contextTexts);
  if (markers.length > 0 && mergeSectionMarkersFromCopilotTexts(previous, ...contextTexts).status === 'applied') {
    return {
      status: 'proposed',
      ...buildProposal(
        'add_section_markers',
        [
          '## Add section header comments',
          '',
          'BeatBax can insert the suggested `# --- Section N: … ---` comment lines',
          'before the relevant `seq` groups (music unchanged).',
        ].join('\n'),
      ),
    };
  }

  return null;
}

export interface ArrangementLayoutFixOptions {
  /** When true, run the built-in command immediately instead of proposing it. */
  confirmed?: boolean;
  /** Run a specific local command (from the Run command locally button). */
  action?: ArrangementLayoutFixAction;
}

/** Apply or propose a local arrangement layout fix without calling the model. */
export function tryApplyArrangementLayoutFix(
  previous: string,
  ...args: Array<string | undefined | ArrangementLayoutFixOptions>
): ArrangementLayoutFixResult {
  const maybeOptions = args[args.length - 1];
  const options: ArrangementLayoutFixOptions = (
    maybeOptions && typeof maybeOptions === 'object' && ('confirmed' in maybeOptions || 'action' in maybeOptions)
  ) ? maybeOptions as ArrangementLayoutFixOptions : {};
  const contextTexts = args.filter((arg): arg is string | undefined => typeof arg === 'string' || arg === undefined);

  const { ast } = parseSong(previous);
  const layout = detectArrangementLayout(previous, ast);
  const hasIntent = isArrangementLayoutFixIntent(...contextTexts)
    || options.confirmed
    || Boolean(options.action);
  const hasMarkers = collectSectionMarkers(...contextTexts).length > 0;
  const confirmed = options.confirmed
    || isArrangementLayoutFixConfirmation(...contextTexts)
    || Boolean(options.action);

  if (layout === 'structured' && (hasIntent || hasMarkers)) {
    return { status: 'already', message: 'Section headers are already in the editor.' };
  }

  const runAction = (action: ArrangementLayoutFixAction): ArrangementLayoutFixResult | null => {
    if (options.action && options.action !== action) return null;
    switch (action) {
      case 'split_monolithic':
        return applyMonolithicSplit(previous, ast);
      case 'restructure_phased':
        return applyPhasedRestructure(previous, ast);
      case 'add_section_markers':
        return applySectionMarkers(previous, ...contextTexts);
      default:
        return null;
    }
  };

  if (confirmed) {
    if (layout === 'monolithic' || options.action === 'split_monolithic') {
      const split = runAction('split_monolithic');
      if (split) return split;
    }
    if (layout === 'phased' || options.action === 'restructure_phased') {
      const phased = runAction('restructure_phased');
      if (phased) return phased;
    }
    const markers = runAction('add_section_markers');
    if (markers) return markers;

    if (layout === 'phased' && hasIntent) {
      return { status: 'not_applicable' };
    }
    if (hasMarkers) {
      return { status: 'not_applicable' };
    }
    return { status: 'not_applicable' };
  }

  if (!hasIntent && !hasMarkers) {
    return { status: 'not_applicable' };
  }

  const proposal = proposeForLayout(previous, ast, layout, ...contextTexts);
  if (proposal) return proposal;

  if (layout === 'phased' && hasIntent) {
    return { status: 'not_applicable' };
  }
  if (hasMarkers) {
    return { status: 'not_applicable' };
  }

  return { status: 'not_applicable' };
}

/** Most recent assistant reply in chat (for typed "apply this" follow-ups). */
export function getLastAssistantChatContent(
  messages: Array<{ role: string; content: string }>,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && message.content.trim()) {
      return message.content;
    }
  }
  return undefined;
}
