import { chipRegistry } from '@beatbax/engine/chips';

/** Resolve a chip directive value (name or alias) to its canonical registry id. */
export function resolveUiChipId(chip: string | undefined): string {
  const raw = (chip || 'gameboy').toLowerCase();
  return chipRegistry.resolve(raw);
}
