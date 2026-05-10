/**
 * AY-3-8910 / YM2149 VGM backend stub.
 *
 * Returns a validation error when export is attempted on an AY song,
 * so the dispatcher produces a clear diagnostic instead of
 * "no backend registered for chip=ay".
 *
 * Full AY-3-8910 VGM translation will be implemented in a follow-up PR.
 */

import type { VgmBackend, SongLike, VgmTranslateResult } from './types.js';
import type { Gd3Fields } from '../gd3.js';
import type { VgmHeaderParams } from '../vgmWriter.js';

export const ayVgmBackend: VgmBackend = {
  chipAliases: ['ay', 'ym2149', 'ay38910', 'amstrad-cpc', 'atari-st', 'msx', 'zx-spectrum-128', 'oric-1', 'colour-genie', 'apple-ii-mockingboard', 'intellivision', 'vectrex'],

  validate(_song: SongLike): string[] {
    return ['AY-3-8910 VGM backend is not yet implemented.'];
  },

  translate(_song: SongLike): VgmTranslateResult {
    throw new Error('AY-3-8910 VGM backend is not yet implemented.');
  },

  buildGd3Fields(_song: SongLike, _result: VgmTranslateResult): Gd3Fields {
    throw new Error('AY-3-8910 VGM backend is not yet implemented.');
  },

  headerParams(_song: SongLike, _result: VgmTranslateResult): VgmHeaderParams {
    throw new Error('AY-3-8910 VGM backend is not yet implemented.');
  },
};
