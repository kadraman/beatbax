/**
 * Backward-compatible shim.
 *
 * The canonical SN76489 state module now lives in `sn76489State.ts`.
 */

export {
  GG_STEREO_DEFAULT,
  ATTENUATION_MUTE,
  SN76489State,
} from './sn76489State.js';
export type { DirtyBytes } from './sn76489State.js';
