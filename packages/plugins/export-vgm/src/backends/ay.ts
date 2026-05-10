/**
 * Backward-compatible shim.
 *
 * The canonical AY-3-8910 backend module now lives in `ay38910.ts`.
 */

export {
  ay38910VgmBackend,
  ayVgmBackend,
} from './ay38910.js';
