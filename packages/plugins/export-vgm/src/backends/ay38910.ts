/**
 * AY-3-8910 VGM backend stub.
 *
 * Returns a validation error when export is attempted on an AY-3-8910 song,
 * so the dispatcher produces a clear diagnostic instead of
 * "no backend registered for chip=zx-spectrum-128".
 *
 * Full AY-3-8910 VGM translation will be implemented in a follow-up PR.
 */

import type { VgmBackend, SongLike, VgmTranslateResult } from './types.js';
import type { Gd3Fields } from '../gd3.js';
import type { VgmHeaderParams } from '../vgmWriter.js';

export const ay38910VgmBackend: VgmBackend = {
  chipAliases: ['ay', 'ay38910','zx-spectrum-128', 'amstrad-cpc'],

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

