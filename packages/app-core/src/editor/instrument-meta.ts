/**
 * Chip-specific instrument type and property value hints for autocomplete,
 * syntax highlighting, and hover helpers.
 */

export interface InstPropertyMeta {
  /** Suggested literal values when known. */
  values?: string[];
  detail?: string;
}

export interface ChipInstrumentMeta {
  types: string[];
  properties: Record<string, InstPropertyMeta>;
}

/** Per-canonical-chip instrument completion metadata. */
export const CHIP_INSTRUMENT_META: Record<string, ChipInstrumentMeta> = {
  gameboy: {
    types: ['pulse1', 'pulse2', 'wave', 'noise'],
    properties: {
      type: { values: ['pulse1', 'pulse2', 'wave', 'noise'], detail: 'Channel type' },
      duty: { values: ['12.5', '12', '25', '50', '75'], detail: 'Duty cycle (%)' },
      env: { detail: 'Envelope e.g. 12,down or gb:12,down,1' },
      wave: { detail: '32-sample wavetable array' },
      sweep: { detail: 'Hardware sweep (pulse1)' },
      volume: { values: ['0', '25', '50', '100'], detail: 'Wave channel volume' },
      width: { values: ['7', '15'], detail: 'Noise width mode' },
      gm: { detail: 'MIDI program 0–127' },
      note: { detail: 'Default hit note e.g. C2' },
    },
  },
  nes: {
    types: ['pulse1', 'pulse2', 'triangle', 'noise', 'dmc'],
    properties: {
      type: { values: ['pulse1', 'pulse2', 'triangle', 'noise', 'dmc'], detail: 'NES/Famicom channel type' },
      duty: { values: ['12', '12.5', '25', '50', '75'], detail: 'Pulse duty (%)' },
      env: { detail: 'Volume envelope e.g. 15,down' },
      env_period: { detail: 'Envelope period 0–15' },
      vol: { detail: 'Static volume 0–15' },
      vol_env: { detail: 'Software volume macro [levels|loop]' },
      duty_env: { detail: 'Duty macro [indices|loop]' },
      arp_env: { detail: 'Arpeggio macro semitone offsets' },
      pitch_env: { detail: 'Pitch macro semitone offsets' },
      sweep_en: { values: ['true', 'false'], detail: 'Enable hardware sweep' },
      sweep_period: { detail: 'Sweep period 1–7' },
      sweep_shift: { detail: 'Sweep shift 0–7' },
      sweep_dir: { values: ['up', 'down'], detail: 'Sweep direction' },
      note: { detail: 'Default note for hits' },
      sample: { detail: 'DMC sample reference' },
    },
  },
  'spectrum-128': {
    types: ['tone1', 'tone2', 'tone3'],
    properties: {
      type: { values: ['tone1', 'tone2', 'tone3'], detail: 'AY tone channel A/B/C' },
      vol: { detail: 'Fixed amplitude 0–15' },
      vol_env: { detail: 'Hardware envelope on R11–R13 (global; one at a time)' },
      arp_env: { detail: 'Software arpeggio macro (semitone offsets)' },
      pitch_env: { detail: 'Software pitch macro (semitone offsets)' },
      tone: { values: ['true', 'false'], detail: 'Force tone generator on/off (R7 mixer)' },
      tone_mix: { values: ['true', 'false'], detail: 'Route shared noise into this channel' },
      noise_rate: { detail: 'R6 noise period 0–31 (global)' },
      noise_frames: { detail: 'Mix noise for first N 60 Hz frames only' },
      tone_frames: { detail: 'Mix tone for first N 60 Hz frames only (stick click)' },
      tone_vol: { detail: 'Tone-path volume cap 0–15' },
      env_bass: { values: ['true', 'false'], detail: 'Buzz bass — envelope as oscillator' },
      env_shape: { detail: 'R13 shape 0–15 (env_bass only; 8=saw repeat, 10=double saw)' },
      chipRegion: { values: ['spectrum-128', 'cpc'], detail: 'Platform AY clock preset' },
      note: { detail: 'Default hit note e.g. E7' },
      gm: { detail: 'MIDI program 0–127' },
    },
  },
  sms: {
    types: ['tone1', 'tone2', 'tone3', 'noise'],
    properties: {
      type: { values: ['tone1', 'tone2', 'tone3', 'noise'], detail: 'SN76489 channel type' },
      vol: { values: ['0', '5', '10', '15'], detail: 'Attenuation 0–15 (0=loudest, 15=mute)' },
      vol_env: { detail: 'Volume macro [levels|loop]; 0=loudest, 15=silent' },
      arp_env: { detail: 'Arpeggio macro semitone offsets' },
      pitch_env: { detail: 'Pitch macro semitone offsets' },
      noise_mode: { values: ['white', 'periodic'], detail: 'LFSR noise mode' },
      noise_rate: { values: ['0', '1', '2', 'tone3'], detail: 'Noise clock divisor' },
      noise_rate_env: { detail: 'Animate noise_rate per frame' },
      gg_pan: { values: ['L', 'C', 'R'], detail: 'Game Gear stereo routing' },
      note: { detail: 'Default note for hits' },
      gm: { detail: 'MIDI program 0–127' },
    },
  },
};

/** Canonical chip ids for instrument metadata (mirrors chipRegistry aliases). */
const CHIP_ALIASES: Record<string, string> = {
  gb: 'gameboy',
  dmg: 'gameboy',
  ay: 'spectrum-128',
  spectrum: 'spectrum-128',
  cpc: 'spectrum-128',
  'amstrad-cpc': 'spectrum-128',
  gg: 'sms',
  gamegear: 'sms',
};

const GENERIC_PROPERTIES: Record<string, InstPropertyMeta> = {
  type: { detail: 'Instrument channel type' },
  env: { detail: 'Envelope' },
  gm: { detail: 'MIDI program' },
  note: { detail: 'Default note' },
  vol: { detail: 'Volume 0–15' },
};

/** Union of every instrument property name across all chips (for Monarch / regex). */
export const ALL_INST_PROPERTY_NAMES: readonly string[] = (() => {
  const names = new Set<string>();
  for (const meta of Object.values(CHIP_INSTRUMENT_META)) {
    for (const key of Object.keys(meta.properties)) names.add(key);
  }
  names.add('noise');
  names.add('use_envelope');
  names.add('noise_rate_env');
  return [...names].sort((a, b) => b.length - a.length);
})();

/** Regex fragment for `\b(prop1|prop2|…)\b(?=\s*=)` — longest names first. */
export const INST_PROPERTY_NAME_PATTERN = ALL_INST_PROPERTY_NAMES.join('|');

export function getChipInstrumentMeta(chip: string): ChipInstrumentMeta {
  const canonical = CHIP_ALIASES[chip] ?? chip;
  return CHIP_INSTRUMENT_META[canonical] ?? {
    types: [],
    properties: { ...GENERIC_PROPERTIES },
  };
}

export function getInstPropertyCompletions(
  chip: string,
  property: string,
): InstPropertyMeta | null {
  const meta = getChipInstrumentMeta(chip);
  return meta.properties[property] ?? GENERIC_PROPERTIES[property] ?? null;
}

/** Property names valid for autocomplete on an `inst` line for the active chip. */
export function getInstPropertyNamesForChip(chip: string): string[] {
  return Object.keys(getChipInstrumentMeta(chip).properties);
}

/** Parse property keys already present on an `inst` definition line. */
export function parseUsedInstProperties(line: string): Set<string> {
  const used = new Set<string>();
  for (const match of line.matchAll(/\b([A-Za-z_][\w]*)\s*=/g)) {
    used.add(match[1]);
  }
  return used;
}
