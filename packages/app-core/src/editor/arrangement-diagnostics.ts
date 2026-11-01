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
    'Monolithic layout detected. Section focus plays the whole song. Prefer `section` / `form` with `channel auto` (or `role` + `form`) so Pattern Grid gets real sections. Classic alternative: split each channel into multiple top-level seq refs, or use Arrange: Split Monolithic Channel Sequences for the 19-slot layout.',
  phased:
    'Phased layout detected. Prefer migrating to `section` / `form` with `channel auto` (or `role` + `form`) for Pattern Grid sections. Legacy alternative: add `# --- Section N ---` headers above cross-channel seq groups, or use Arrange: Restructure Phased Sections into Headers.',
  mixed:
    'Mixed layout detected. Channels have different seq counts; section slices may be misaligned. Prefer equalizing timelines or moving to `section` / `form` with a shared form order.',
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
