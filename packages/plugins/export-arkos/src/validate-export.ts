import { noteToArkos } from './arkos-notes.js';
import {
  ARKOS_SUPPORTED_CHIPS,
  type SongLike,
  type ChannelEventLike,
} from './arkos-types.js';

const SUPPORTED = new Set<string>(ARKOS_SUPPORTED_CHIPS);

/** Instrument fields that are intentionally unsupported in v1 (fail-hard). */
const UNSUPPORTED_INST_FIELDS = [
  'arp_env',
  'pitch_env',
  'vol_env',
  'env_bass',
  'env_shape',
  'noise_frames',
  'tone_frames',
] as const;

function normalizeChip(chip?: string): string {
  return String(chip ?? '').toLowerCase().trim();
}

function hasMacroContent(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  const s = String(value).trim();
  return s.length > 0 && s !== '[]';
}

function collectInstrumentErrors(
  name: string,
  inst: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const type = String(inst.type ?? '').toLowerCase();
  if (!['tone1', 'tone2', 'tone3'].includes(type)) {
    errors.push(
      `Instrument "${name}": type "${type || '(missing)'}" is not a Spectrum/CPC tone channel (expected tone1|tone2|tone3).`,
    );
  }

  for (const field of UNSUPPORTED_INST_FIELDS) {
    if (hasMacroContent(inst[field])) {
      errors.push(
        `Instrument "${name}": field "${field}" is not supported by Arkos export v1. Remove it or wait for a later exporter version.`,
      );
    }
  }

  return errors;
}

function namedEventPitch(ev: ChannelEventLike): string | null {
  const pitch = String(ev.defaultNote ?? '').trim();
  if (!pitch) return null;
  return noteToArkos(pitch) === null ? null : pitch;
}

function collectEventErrors(channelId: number, events: ChannelEventLike[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const effects = Array.isArray(ev.effects) ? ev.effects : [];
    if (effects.length > 0) {
      const names = effects.map((fx) => fx.type).join(', ');
      errors.push(
        `Channel ${channelId} event ${i}: inline effects (${names}) are not supported by Arkos export v1.`,
      );
      // One diagnostic per channel is enough once we hit effects.
      break;
    }
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type !== 'named') continue;
    if (namedEventPitch(ev)) continue;
    const name = ev.token || ev.instrument || '(unnamed)';
    errors.push(
      `Channel ${channelId} event ${i}: named instrument "${name}" has no usable defaultNote (Arkos export v1 requires inst note=… / defaultNote so the event is not dropped as a rest).`,
    );
  }
  return errors;
}

/**
 * Validate that a resolved song can be exported to Arkos Tracker in v1.
 * Returns human-readable error strings (empty = ok).
 */
export function validateArkosExport(song: SongLike): string[] {
  const errors: string[] = [];
  const chip = normalizeChip(song.chip);
  if (!SUPPORTED.has(chip)) {
    errors.push(
      `Arkos export requires a Spectrum/CPC chip (got "${song.chip ?? '(none)'}"). Supported: ${ARKOS_SUPPORTED_CHIPS.join(', ')}.`,
    );
    return errors;
  }

  const channels = Array.isArray(song.channels) ? song.channels : [];
  if (channels.length === 0) {
    errors.push('Song has no channels to export.');
  }
  if (channels.length > 3) {
    errors.push(`Arkos AY export supports at most 3 channels (got ${channels.length}).`);
  }

  const insts = song.insts ?? {};
  for (const name of Object.keys(insts).sort()) {
    errors.push(...collectInstrumentErrors(name, insts[name] ?? {}));
  }

  for (const ch of channels) {
    errors.push(...collectEventErrors(ch.id, ch.events ?? []));
  }

  return errors;
}

export function isArkosSupportedChip(chip?: string): boolean {
  return SUPPORTED.has(normalizeChip(chip));
}
