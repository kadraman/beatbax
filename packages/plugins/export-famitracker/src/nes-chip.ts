import { chipRegistry } from '@beatbax/engine';

/** True when the song chip resolves to the built-in NES backend (includes `famicom` alias). */
export function isNesChip(chipName: string | undefined): boolean {
  const raw = String(chipName ?? 'gameboy').toLowerCase();
  return chipRegistry.resolve(raw) === 'nes';
}

export function ensureNesChip(chipName: string | undefined): string[] {
  const raw = String(chipName ?? 'gameboy').toLowerCase();
  return isNesChip(raw) ? [] : [`FamiTracker exporters support only chip 'nes' (got '${raw}')`];
}
