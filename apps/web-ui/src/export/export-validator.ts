/**
 * Export validator - Pre-export validation
 * Part of Phase 3: Export & Import
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:export-validator');

/**
 * Severity level for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  component?: string;
  suggestion?: string;
}

/**
 * Result of a validation run
 */
export interface ValidationResult {
  valid: boolean; // false only if there are errors
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Validate an AST (parsed song) before export.
 * Returns errors and warnings without throwing.
 */
export function validateForExport(ast: any, format?: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!ast || typeof ast !== 'object') {
    issues.push({
      severity: 'error',
      message: 'No song loaded. Parse a .bax file first.',
      component: 'validation',
    });
    return buildResult(issues);
  }

  // Check for channels
  if (!ast.channels || !Array.isArray(ast.channels) || ast.channels.length === 0) {
    issues.push({
      severity: 'error',
      message: 'Song has no channels defined.',
      component: 'validation',
      suggestion: 'Add a channel directive, e.g.: channel 1 => inst lead seq main',
    });
  }

  // Check for instruments
  if (!ast.insts || Object.keys(ast.insts || {}).length === 0) {
    issues.push({
      severity: 'warning',
      message: 'Song has no instrument definitions.',
      component: 'validation',
      suggestion: 'Add inst definitions before using them in patterns.',
    });
  }

  // Check for patterns or sequences
  const hasPats = ast.pats && Object.keys(ast.pats || {}).length > 0;
  const hasSeqs = ast.seqs && Object.keys(ast.seqs || {}).length > 0;
  if (!hasPats && !hasSeqs) {
    issues.push({
      severity: 'warning',
      message: 'Song has no patterns or sequences defined.',
      component: 'validation',
      suggestion: 'Add pat definitions to create musical content.',
    });
  }

  // Validate instrument references in channels
  for (const ch of (ast.channels || [])) {
    if (ch.inst && ast.insts && !ast.insts[ch.inst]) {
      issues.push({
        severity: 'error',
        message: `Channel ${ch.id} references undefined instrument '${ch.inst}'.`,
        component: 'validation',
        suggestion: `Define 'inst ${ch.inst}' before using it.`,
      });
    }
  }

  // Format-specific validation
  if (format === 'uge') {
    validateForUGE(ast, issues);
  } else if (format === 'midi') {
    validateForMIDI(ast, issues);
  }

  return buildResult(issues);
}

/**
 * UGE-specific validation checks
 */
function validateForUGE(ast: any, issues: ValidationIssue[]): void {
  const insts = ast.insts || {};
  const instCount = Object.keys(insts).length;

  // Check instrument count limits
  const duty = Object.values(insts).filter((i: any) =>
    ['pulse1', 'pulse2', 'duty'].includes((i as any).type?.toLowerCase())
  ).length;
  const wave = Object.values(insts).filter((i: any) =>
    (i as any).type?.toLowerCase() === 'wave'
  ).length;
  const noise = Object.values(insts).filter((i: any) =>
    (i as any).type?.toLowerCase() === 'noise'
  ).length;

  if (duty > 15) {
    issues.push({
      severity: 'warning',
      message: `${duty} duty instruments defined; UGE supports max 15. Extra instruments will be dropped.`,
      component: 'uge-validation',
    });
  }
  if (wave > 15) {
    issues.push({
      severity: 'warning',
      message: `${wave} wave instruments defined; UGE supports max 15. Extra instruments will be dropped.`,
      component: 'uge-validation',
    });
  }
  if (noise > 15) {
    issues.push({
      severity: 'warning',
      message: `${noise} noise instruments defined; UGE supports max 15. Extra instruments will be dropped.`,
      component: 'uge-validation',
    });
  }

  // Check for channel count (Game Boy has exactly 4 channels)
  const channels = (ast.channels || []);
  if (channels.length > 4) {
    issues.push({
      severity: 'warning',
      message: `Song has ${channels.length} channels; UGE (Game Boy) supports max 4. Extra channels will be ignored.`,
      component: 'uge-validation',
    });
  }
}

/**
 * MIDI-specific validation checks
 */
function validateForMIDI(ast: any, issues: ValidationIssue[]): void {
  const channels = (ast.channels || []);
  if (channels.length > 16) {
    issues.push({
      severity: 'warning',
      message: `Song has ${channels.length} channels; MIDI supports max 16. Channels beyond 16 will be dropped.`,
      component: 'midi-validation',
    });
  }

  // Check for noise channels mapping to drums
  const insts = ast.insts || {};
  const noiseChannels = channels.filter((ch: any) => {
    const inst = insts[ch.inst];
    return inst && inst.type?.toLowerCase() === 'noise';
  });
  if (noiseChannels.length > 0) {
    issues.push({
      severity: 'info',
      message: `${noiseChannels.length} noise channel(s) will be mapped to MIDI percussion channel 10.`,
      component: 'midi-validation',
    });
  }
}

/**
 * Build the result summary from collected issues
 */
function buildResult(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  log.debug(`Validation complete: ${errors.length} errors, ${warnings.length} warnings`);

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
  };
}
