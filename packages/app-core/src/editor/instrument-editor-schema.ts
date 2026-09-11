/**
 * Resolve a chip's Instrument Editor schema, falling back to CHIP_INSTRUMENT_META.
 */

import { chipRegistry } from '@beatbax/engine/chips';
import type {
  ChipInstrumentEditor,
  ChipInstrumentFieldDef,
  ChipInstrumentMacroDef,
  ChipInstrumentTypeDef,
  ChipInstrumentWidget,
} from '@beatbax/engine/chips';
import { getChipInstrumentMeta } from './instrument-meta.js';

const MACRO_NAMES = new Set(['vol_env', 'duty_env', 'arp_env', 'pitch_env', 'noise_rate_env']);

const PREVIEW_CHANNEL: Record<string, number> = {
  pulse1: 1,
  pulse2: 2,
  wave: 3,
  triangle: 3,
  noise: 4,
  dmc: 5,
  tone1: 1,
  tone2: 2,
  tone3: 3,
};

export function fieldApplies(whenType: string | string[] | undefined, type: string | undefined): boolean {
  if (!whenType) return true;
  const t = (type ?? '').toLowerCase();
  const list = Array.isArray(whenType) ? whenType : [whenType];
  return list.some((x) => x.toLowerCase() === t);
}

function inferWidget(name: string, values?: string[]): ChipInstrumentWidget {
  if (values && values.length) return 'enum';
  if (name === 'sample' || name === 'dmc_sample') return 'sample';
  if (name === 'uge_note') return 'uge_note';
  if (name === 'note') return 'note';
  if (name === 'sweep_en' || name === 'tone' || name === 'tone_mix' || name === 'env_bass') return 'bool';
  if (name === 'env') return 'envelope';
  if (name === 'sweep') return 'sweep';
  if (name === 'gm' || name === 'vol' || name === 'volume' || name === 'env_period') return 'int';
  return 'text';
}

export function fallbackInstrumentEditor(chip: string): ChipInstrumentEditor {
  const meta = getChipInstrumentMeta(chip);
  const types: ChipInstrumentTypeDef[] = meta.types.map((id) => ({
    id,
    label: id,
    previewChannel: PREVIEW_CHANNEL[id.toLowerCase()] ?? 1,
  }));
  const fields: ChipInstrumentFieldDef[] = [];
  const macros: ChipInstrumentMacroDef[] = [];
  for (const [name, prop] of Object.entries(meta.properties)) {
    if (name === 'type' || name === 'wave') continue;
    if (MACRO_NAMES.has(name)) {
      macros.push({
        name,
        label: name,
        min: name === 'arp_env' || name === 'pitch_env' ? -24 : 0,
        max: name === 'duty_env' ? 3 : 15,
        signed: name === 'arp_env' || name === 'pitch_env',
        loop: true,
        hint: prop.detail,
      });
      continue;
    }
    fields.push({
      name,
      label: name,
      widget: inferWidget(name, prop.values),
      values: prop.values,
      hint: prop.detail,
    });
  }
  return { types, fields, macros, presets: [] };
}

export function resolveInstrumentEditorSchema(chip: string): ChipInstrumentEditor {
  const canonical = chipRegistry.resolve(chip);
  const plugin = chipRegistry.get(canonical);
  if (plugin?.instrumentEditor) return plugin.instrumentEditor;
  return fallbackInstrumentEditor(chip);
}

export function resolvePreviewChannel(
  instType: string | undefined,
  chip: string | undefined,
  schema?: ChipInstrumentEditor,
): number {
  const type = (instType ?? '').toLowerCase();
  const editor = schema ?? resolveInstrumentEditorSchema(chip ?? 'gameboy');
  const fromSchema = editor.types.find((t) => t.id.toLowerCase() === type);
  let channelId = fromSchema?.previewChannel ?? PREVIEW_CHANNEL[type] ?? 1;
  const plugin = chipRegistry.get(chipRegistry.resolve((chip ?? 'gameboy').toLowerCase()));
  const maxChannel = plugin?.channels ?? channelId;
  return Math.min(channelId, maxChannel);
}

export type InstrumentSampleScheme = 'bundled' | 'local' | 'https' | 'github';

export const INSTRUMENT_SAMPLE_SCHEMES: ReadonlyArray<{
  id: InstrumentSampleScheme;
  label: string;
}> = [
  { id: 'bundled', label: 'Bundled' },
  { id: 'local', label: 'Local' },
  { id: 'https', label: 'HTTPS' },
  { id: 'github', label: 'GitHub' },
];

function resolvedChipPlugin(chip: string) {
  return chipRegistry.get(chipRegistry.resolve(chip.toLowerCase()));
}

/** `@<plugin.name>/` prefix for bundled sample refs. */
export function bundledSamplePrefix(chip: string): string {
  const plugin = resolvedChipPlugin(chip);
  const name = plugin?.name ?? chipRegistry.resolve(chip.toLowerCase());
  return `@${name}/`;
}

/** Bundled sample keys (no `@chip/` prefix), sorted for stable UI. */
export function listBundledSampleNames(chip: string): string[] {
  const plugin = resolvedChipPlugin(chip);
  if (!plugin?.bundledSamples) return [];
  return Object.keys(plugin.bundledSamples).sort((a, b) => a.localeCompare(b));
}

/**
 * Bundled sample refs for the Instrument Editor `sample` widget (`@chip/name`).
 * Sorted by sample key for stable UI.
 */
export function listBundledSampleRefs(chip: string): string[] {
  const prefix = bundledSamplePrefix(chip);
  return listBundledSampleNames(chip).map((key) => `${prefix}${key}`);
}

export function parseInstrumentSampleRef(
  ref: string,
  chip: string,
): { scheme: InstrumentSampleScheme; remainder: string } {
  const value = ref.trim();
  if (!value) return { scheme: 'bundled', remainder: '' };

  const prefix = bundledSamplePrefix(chip);
  if (value.startsWith(prefix)) {
    return { scheme: 'bundled', remainder: value.slice(prefix.length) };
  }
  if (value.startsWith('local:')) {
    return { scheme: 'local', remainder: value.slice('local:'.length) };
  }
  if (value.startsWith('https://')) {
    return { scheme: 'https', remainder: value.slice('https://'.length) };
  }
  if (value.startsWith('http://')) {
    return { scheme: 'https', remainder: value.slice('http://'.length) };
  }
  if (value.startsWith('github:')) {
    return { scheme: 'github', remainder: value.slice('github:'.length) };
  }
  if (!value.includes(':') && !value.includes('/')) {
    return { scheme: 'bundled', remainder: value };
  }
  return { scheme: 'local', remainder: value };
}

export function formatInstrumentSampleRef(
  scheme: InstrumentSampleScheme,
  remainder: string,
  chip: string,
): string {
  const rest = remainder.trim();
  if (!rest) return '';
  switch (scheme) {
    case 'bundled': {
      const prefix = bundledSamplePrefix(chip);
      const name = rest.startsWith(prefix) ? rest.slice(prefix.length) : rest;
      return name ? `${prefix}${name}` : '';
    }
    case 'local':
      return `local:${rest.replace(/^local:/, '')}`;
    case 'https':
      return `https://${rest.replace(/^https?:\/\//, '')}`;
    case 'github':
      return `github:${rest.replace(/^github:/, '')}`;
  }
}

/**
 * Remainder to keep when the user changes scheme. Bundled names are not paths,
 * so leaving Bundled clears the value; a bundled name is kept only when it is
 * a known sample for this chip.
 */
export function sampleRemainderForSchemeChange(
  from: InstrumentSampleScheme,
  to: InstrumentSampleScheme,
  remainder: string,
  chip: string,
): string {
  if (from === to) return remainder;
  if (to === 'bundled') {
    return listBundledSampleNames(chip).includes(remainder) ? remainder : '';
  }
  if (from === 'bundled') return '';
  return remainder;
}
