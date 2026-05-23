/**
 * Chip-specific instrument type and property value hints for autocomplete.
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
      type: { values: ['pulse1', 'pulse2', 'triangle', 'noise', 'dmc'], detail: 'NES channel type' },
      duty: { values: ['12', '12.5', '25', '50', '75'], detail: 'Pulse duty (%)' },
      env: { detail: 'Volume envelope e.g. 15,down' },
      env_period: { detail: 'Envelope period 0–15' },
      vol: { detail: 'Static volume 0–15' },
      vol_env: { detail: 'Volume macro [levels|loop]' },
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
};

const GENERIC_PROPERTIES: Record<string, InstPropertyMeta> = {
  type: { detail: 'Instrument channel type' },
  env: { detail: 'Envelope' },
  gm: { detail: 'MIDI program' },
  note: { detail: 'Default note' },
};

export function getChipInstrumentMeta(chip: string): ChipInstrumentMeta {
  return CHIP_INSTRUMENT_META[chip] ?? {
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
