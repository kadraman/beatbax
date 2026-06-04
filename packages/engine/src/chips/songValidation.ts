import type { ValidationError, SongValidationContext } from './types.js';
import type { AST } from '../parser/ast.js';
import { chipRegistry } from './registry.js';

/**
 * Run optional song-level chip validation for a parsed AST fragment.
 * Returns plugin diagnostics (typically warnings about shared-resource conflicts).
 */
export function getSongValidationIssues(ast: AST): ValidationError[] {
  if (!ast.chip || !ast.insts) return [];
  const chipName = chipRegistry.resolve(String(ast.chip).toLowerCase());
  const plugin = chipRegistry.get(chipName);
  if (!plugin?.validateSong) return [];
  return plugin.validateSong({ instruments: ast.insts, song: ast });
}
