/**
 * VGM backend registry.
 *
 * Maintains a map from normalised chip alias → VgmBackend.
 * The dispatcher in index.ts calls resolveBackend() to find the right backend
 * for the song's chip field.
 *
 * Backends register themselves by calling registerBackend() with a VgmBackend
 * instance. Each alias in chipAliases is normalised and indexed separately so
 * look-ups are O(1) regardless of the number of backends.
 */

import type { VgmBackend } from './backends/types.js';
import { sn76489VgmBackend } from './backends/sn76489.js';
import { ay38910VgmBackend } from './backends/ay38910.js';

// ─── Alias normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a chip alias for registry look-up.
 * Converts to lowercase and strips all spaces, underscores and hyphens.
 *
 * Examples: "Game Gear" → "gamegear", "AY-3-8910" → "ay38910"
 */
export function normaliseAlias(alias: string): string {
  return alias.toLowerCase().replace(/[\s_-]/g, '');
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Map from normalised chip alias → backend instance. */
const registry = new Map<string, VgmBackend>();

/**
 * Register a VgmBackend. All aliases in backend.chipAliases are normalised
 * and mapped to this backend. Throws if an alias is already registered by a
 * different backend (prevents silent collisions).
 */
export function registerBackend(backend: VgmBackend): void {
  for (const alias of backend.chipAliases) {
    const key = normaliseAlias(alias);
    const existing = registry.get(key);
    if (existing && existing !== backend) {
      throw new Error(
        `VGM backend conflict: alias "${key}" is already registered by a different backend.`
      );
    }
    registry.set(key, backend);
  }
}

/**
 * Look up the backend for a chip string from the song ISM.
 *
 * @returns The matching VgmBackend, or undefined when no backend is registered
 *          for the given chip.
 */
export function resolveBackend(chip: string): VgmBackend | undefined {
  return registry.get(normaliseAlias(chip));
}

/**
 * Return all unique registered backend instances (each backend listed once,
 * even if it has multiple aliases).
 */
export function listBackends(): VgmBackend[] {
  const seen = new Set<VgmBackend>();
  for (const backend of registry.values()) {
    seen.add(backend);
  }
  return [...seen];
}

/**
 * Return all normalised chip aliases currently registered (sorted).
 * Used for building the supportedChips list and error messages.
 */
export function listRegisteredAliases(): string[] {
  return [...registry.keys()].sort();
}

/**
 * Format a "no backend found" error message that names available backends.
 *
 * Example output:
 *   VGM export failed: no VGM backend registered for chip="ay".
 *   Available backends: sms, gamegear.
 */
export function missingBackendError(chip: string): string {
  const available = listRegisteredAliases().join(', ');
  return (
    `VGM export failed: no VGM backend registered for chip=${JSON.stringify(chip)}.\n` +
    `Available backends: ${available || '(none)'}.`
  );
}

// ─── Default backend registration ─────────────────────────────────────────────

registerBackend(sn76489VgmBackend);
registerBackend(ay38910VgmBackend);
