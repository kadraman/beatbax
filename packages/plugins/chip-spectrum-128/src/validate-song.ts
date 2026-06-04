/**
 * Song-level validation for shared AY-3-8912 resources.
 *
 * The AY chip shares R6 (noise period) and R11–R13 (envelope program) across
 * all three channels. When a parsed song AST is available, validation is
 * tick-aware (sustain-aware overlap). Without channel data, no warnings are
 * emitted — conflicts require proof of simultaneous sounding voices.
 */
import type { SongValidationContext, ValidationError } from '@beatbax/engine';
import { validateSongTimeline } from './validate-song-timeline.js';

export type { SongValidationContext };

/**
 * Check for shared-resource conflicts in a song.
 * Returns diagnostic ValidationErrors (as warnings in the editor).
 */
export function validateSong(ctx: SongValidationContext): ValidationError[] {
  if (ctx.song?.channels?.length) {
    return validateSongTimeline(ctx.song, ctx.instruments);
  }
  return [];
}
