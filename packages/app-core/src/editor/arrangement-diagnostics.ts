/**
 * Info-level editor diagnostics for arrangement layouts that limit section focus.
 */

import type { ValidationIssue } from '../types/validation.js';
import {
  detectArrangementLayout,
  findFirstChannelLine,
  type ArrangementLayout,
} from './arrangement-slice.js';

const LAYOUT_MESSAGES: Record<Exclude<ArrangementLayout, 'structured'>, string> = {
  monolithic:
    'Monolithic layout detected. Section focus plays the whole song. Split each channel into multiple top-level seq refs (e.g. fanfare, theme_a, theme_b) for Pattern Grid sections.',
  phased:
    'Phased layout detected. Add `# --- Section N ---` headers above cross-channel seq groups for full section focus editor highlighting.',
  mixed:
    'Mixed layout detected. Channels have different seq counts; section slices may be misaligned across channels.',
};

/** Info diagnostics for non-structured arrangement layouts (section focus hints). */
export function getArrangementLayoutDiagnostics(
  fullSource: string,
  ast?: any,
): ValidationIssue[] {
  const layout = detectArrangementLayout(fullSource, ast);
  if (layout === 'structured') return [];

  const line = findFirstChannelLine(fullSource);
  if (!line) return [];

  return [{
    component: 'arrangement',
    message: LAYOUT_MESSAGES[layout],
    level: 'info',
    loc: {
      start: { line, column: 1 },
      end: { line, column: 1 },
    },
  }];
}
