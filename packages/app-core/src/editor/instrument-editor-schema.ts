/**
 * Resolve a chip's Instrument Editor schema, falling back to CHIP_INSTRUMENT_META.
 */

import { chipRegistry } from '@beatbax/engine/chips';
import type {
  ChipBundledSampleMeta,
  ChipInstrumentEditor,
  ChipInstrumentFieldDef,
  ChipInstrumentMacroDef,
  ChipInstrumentPreviewMode,
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

export const DEFAULT_PREVIEW_OCTAVE = 4;
export const PREVIEW_OCTAVE_MIN = 2;
export const PREVIEW_OCTAVE_MAX = 7;

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

export function findInstrumentTypeDef(
  instType: string | undefined,
  chip: string | undefined,
  schema?: ChipInstrumentEditor,
): ChipInstrumentTypeDef | undefined {
  const type = (instType ?? '').toLowerCase();
  if (!type) return undefined;
  const editor = schema ?? resolveInstrumentEditorSchema(chip ?? 'gameboy');
  return editor.types.find((t) => t.id.toLowerCase() === type);
}

/** True when `tone_mix` is enabled (AY noise routed into a tone channel). */
export function isToneMixEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    // Accept `true` and `1` — CodeLens regex captures source text as strings,
    // and some songs write booleans as `tone_mix=1`.
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

/**
 * Resolve preview mode for an instrument (default melodic).
 * Spectrum/AY percussion often uses a tone channel with `tone_mix=true` — those
 * force oneshot Trigger even though the type schema is melodic.
 */
export function resolvePreviewMode(
  instType: string | undefined,
  chip: string | undefined,
  schema?: ChipInstrumentEditor,
  props?: Record<string, unknown> | null,
): ChipInstrumentPreviewMode {
  if (isToneMixEnabled(props?.tone_mix)) return 'oneshot';
  return findInstrumentTypeDef(instType, chip, schema)?.previewMode ?? 'melodic';
}

/** Octave digit from a scientific pitch name such as `C4` or `D#3`. */
export function octaveFromScientificNote(note: unknown): number | null {
  if (typeof note !== 'string') return null;
  const m = note.trim().match(/^[A-Ga-g][#b]?\s*(-?\d+)$/);
  if (!m) return null;
  const oct = parseInt(m[1], 10);
  return Number.isFinite(oct) ? oct : null;
}

/**
 * Preview piano octave: `note=` when in range, else type `previewOctave`, else 4.
 * Only meaningful for melodic preview mode.
 */
export function resolvePreviewOctave(
  draftNote: unknown,
  instType: string | undefined,
  chip: string | undefined,
  schema?: ChipInstrumentEditor,
  minOctave = PREVIEW_OCTAVE_MIN,
  maxOctave = PREVIEW_OCTAVE_MAX,
): number {
  const fromNote = octaveFromScientificNote(draftNote);
  if (fromNote != null && fromNote >= minOctave && fromNote <= maxOctave) {
    return fromNote;
  }
  const typeOct = findInstrumentTypeDef(instType, chip, schema)?.previewOctave;
  if (typeof typeOct === 'number' && Number.isFinite(typeOct)) {
    return Math.max(minOctave, Math.min(maxOctave, Math.trunc(typeOct)));
  }
  return DEFAULT_PREVIEW_OCTAVE;
}

/** Melodic CodeLens note labels centred on the type’s preview octave (±2, clamped 2–7). */
export function melodicPreviewNotesForOctave(octave: number): string[] {
  const o = Math.max(PREVIEW_OCTAVE_MIN, Math.min(PREVIEW_OCTAVE_MAX, Math.trunc(octave)));
  const notes: string[] = [];
  for (let n = o - 2; n <= o + 2; n++) {
    if (n >= PREVIEW_OCTAVE_MIN && n <= PREVIEW_OCTAVE_MAX) notes.push(`C${n}`);
  }
  return notes;
}

/** Tracker C notes C-3…C-9 for GB noise audition strip. */
export function ugeNotePreviewStrip(): string[] {
  return ['C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9'];
}

/** Count vol_env frames; `loops` when a `|n` loop point is present. */
function volEnvFrameInfo(raw: unknown): { frames: number; loops: boolean } | null {
  if (Array.isArray(raw)) {
    const vals = raw.map(Number).filter(Number.isFinite);
    return vals.length ? { frames: vals.length, loops: false } : null;
  }
  if (typeof raw !== 'string') return null;
  let str = raw.trim();
  if (!str.startsWith('[')) return null;
  str = str.endsWith(']') ? str.slice(1, -1) : str.slice(1);
  let loops = false;
  const pipeIdx = str.lastIndexOf('|');
  if (pipeIdx >= 0) {
    loops = true;
    str = str.slice(0, pipeIdx);
  }
  const frames = str.split(',').map((s) => s.trim()).filter(Boolean).length;
  return frames > 0 ? { frames, loops } : null;
}

/**
 * Estimated oneshot audition length in seconds for noise / DMC hits.
 * NES/GB `vol_env` advances ~60 Hz and holds the last value — preview must
 * end near the last frame or soft noise hangs for the whole song length.
 */
export function estimateInstrumentHitDurationSec(
  inst: Record<string, unknown> | null | undefined,
): number {
  const type = String(inst?.type ?? '').toLowerCase();
  if (type === 'dmc') return 16;

  const volEnv = volEnvFrameInfo(inst?.vol_env);
  if (volEnv) {
    if (volEnv.loops) return 2;
    return Math.max(0.12, volEnv.frames / 60 + 0.04);
  }
  return 1.5;
}

/** bpm / step count / stop timer for percussion oneshot preview. */
export function hitOneshotPreviewTiming(
  inst: Record<string, unknown> | null | undefined,
): { bpm: number; steps: number; stopAfterMs: number } {
  const durSec = estimateInstrumentHitDurationSec(inst);
  if (durSec <= 1.05) {
    const bpm = Math.round(60 / Math.max(durSec, 0.05));
    return {
      bpm: Math.max(60, Math.min(480, bpm)),
      steps: 1,
      stopAfterMs: Math.round(durSec * 1000) + 250,
    };
  }
  const steps = Math.max(1, Math.ceil(durSec));
  return { bpm: 60, steps, stopAfterMs: steps * 1000 + 500 };
}

/** Look up bundled sample meta for `@chip/name` refs. */
export function resolveBundledSampleMeta(
  chip: string | undefined,
  sampleRef: unknown,
): ChipBundledSampleMeta | null {
  if (typeof sampleRef !== 'string') return null;
  const m = sampleRef.trim().match(/^@([^/]+)\/(.+)$/);
  if (!m) return null;
  const plugin = resolvedChipPlugin(chip ?? m[1]);
  const meta = plugin?.bundledSampleMeta?.[m[2]];
  return meta ?? null;
}

/** Encode a local sample path the same way `formatDmcInstrumentLine` does (`encodeURI`). */
function encodeLocalSamplePath(path: string): string {
  return encodeURI(path);
}

/** Inverse of `encodeLocalSamplePath` for the sample-widget text field. */
function decodeLocalSamplePath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
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
    return { scheme: 'local', remainder: decodeLocalSamplePath(value.slice('local:'.length)) };
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
      // Percent-encode spaces so parseInstRhs cannot split `My Samples/kick.dmc`
      // into extra inst properties. DMC resolve already decodeURI()s local: paths.
      return `local:${encodeLocalSamplePath(rest.replace(/^local:/, ''))}`;
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
