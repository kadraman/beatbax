/**
 * Warnings for WAV export via the PCM renderer (parity with CLI).
 * Live Web Audio playback supports more per-note effects than offline PCM.
 */

import { chipRegistry } from '@beatbax/engine/chips';

/** Effects that only exist in the Web Audio playback graph. */
const WEB_AUDIO_ONLY_EFFECTS = new Set(['echo', 'retrig']);

/**
 * Per-note effects not applied on plugin-chip PCM paths (NES, etc.).
 * Instrument macros (pitch_env, arp_env, vol_env, noise_rate_env) and volSlide are baked.
 */
const PLUGIN_PCM_UNSUPPORTED_NOTE_EFFECTS = new Set([
  'vib',
  'port',
  'arp',
  'bend',
  'trem',
  'cut',
  'sweep',
]);

const EFFECT_LABELS: Record<string, string> = {
  echo: 'echo/delay',
  retrig: 'retrigger',
  vib: 'vibrato',
  port: 'portamento',
  arp: 'arpeggio',
  bend: 'pitch bend',
  trem: 'tremolo',
  cut: 'note cut',
  sweep: 'pitch sweep',
};

function normalizeEffectType(fx: unknown): string {
  if (!fx) return '';
  if (typeof fx === 'string') {
    const match = fx.match(/^([A-Za-z_]+)/);
    return match ? match[1].toLowerCase() : '';
  }
  if (typeof fx === 'object' && fx !== null && 'type' in fx) {
    return String((fx as { type?: unknown }).type ?? '').toLowerCase();
  }
  return '';
}

function collectEffectTypes(song: any): Set<string> {
  const found = new Set<string>();
  for (const ch of song?.channels ?? []) {
    for (const ev of ch?.events ?? []) {
      if (ev?.type !== 'note' && ev?.type !== 'named') continue;
      const effects = ev?.effects;
      if (!Array.isArray(effects)) continue;
      for (const fx of effects) {
        const type = normalizeEffectType(fx);
        if (type) found.add(type);
      }
    }
  }
  return found;
}

function isNesSong(song: any): boolean {
  const chip = String(song?.chip ?? 'gameboy').toLowerCase();
  return chipRegistry.resolve(chip) === 'nes';
}

/**
 * Return user-facing warnings for effects omitted by PCM WAV export.
 */
export function collectPcmWavExportWarnings(song: any): string[] {
  const found = collectEffectTypes(song);
  const warnings: string[] = [];

  if (found.has('echo')) {
    warnings.push(
      'Echo/delay effects are not supported in WAV export (PCM renderer) — they will be omitted.',
    );
  }
  if (found.has('retrig')) {
    warnings.push(
      'Retrigger effects are not supported in WAV export (PCM renderer) — they will be omitted.',
    );
  }

  if (isNesSong(song)) {
    const unsupported = [...PLUGIN_PCM_UNSUPPORTED_NOTE_EFFECTS].filter((type) => found.has(type));
    if (unsupported.length > 0) {
      const labels = unsupported.map((type) => EFFECT_LABELS[type] ?? type).join(', ');
      warnings.push(
        `NES WAV export uses the PCM renderer; per-note ${labels} effects are not rendered in the export (instrument macros still apply). Use live playback to hear them.`,
      );
    }
  }

  return warnings;
}
