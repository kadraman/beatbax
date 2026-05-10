/**
 * Backward-compatible shim.
 *
 * The canonical SN76489 backend module now lives in `sn76489.ts`.
 */

export {
  sn76489VgmBackend,
  smsVgmBackend,
  noteToPeriod,
} from './sn76489.js';
