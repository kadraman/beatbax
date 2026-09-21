/**
 * Default instrument kits for MIDI conversion (wizard-aligned).
 */
import type { MidiChipId, MidiConvertOptions } from './types.js';

const GB_KIT_LINES = [
  'inst lead type=pulse1 duty=50 env={"level":12,"direction":"flat","period":1,"format":"gb"} gm=81',
  'inst arp  type=pulse2 duty=25 env={"level":9,"direction":"down","period":2,"format":"gb"} gm=84',
  'inst bass type=wave wave=[0,5,11,15,15,15,15,15,11,5,0,0,0,0,0,0,0,0,6,8,8,8,8,8,8,8,8,6,0,0,0,0] gm=39',
  'inst kick  type=noise gb:width=7 env={"level":15,"direction":"down","period":1,"format":"gb"}',
  'inst snare type=noise env={"level":12,"direction":"down","period":1,"format":"gb"}',
  'inst hihat type=noise env={"level":5,"direction":"down","period":1,"format":"gb"}',
  'inst shaker type=noise gb:width=7 env={"level":4,"direction":"down","period":1,"format":"gb"} length=4',
];

function nesKitLines(options: MidiConvertOptions): string[] {
  const lines = [
    'inst lead  type=pulse1 duty=25 vol=15 pitch_env=[2,1,0,0,0,0,0,0] gm=81',
    'inst arp   type=pulse2 duty=50 vol_env=[15,15,14,12,10,8,7,6,6,5,5,4,4,3,3,2] gm=84',
    'inst bass  type=triangle linear=96 pitch_env=[1,0,0,0,0,0,0,0] gm=39',
    'inst hihat  type=noise noise_mode=normal noise_period=2 vol_env=[7,4,2,1] note=C5',
  ];
  if (options.dmcReinforcement.enabled) {
    const kick = options.dmcReinforcement.kickSample ?? '@nes/kick';
    const snare = options.dmcReinforcement.snareSample ?? '@nes/snare';
    lines.push(`inst kick   type=dmc dmc_rate=15 dmc_loop=false dmc_sample="${kick}"`);
    lines.push(`inst snare  type=dmc dmc_rate=15 dmc_loop=false dmc_sample="${snare}"`);
  } else {
    lines.push('inst kick  type=noise noise_mode=normal noise_period=8 vol_env=[15,12,8,4,0] note=C3');
    lines.push('inst snare type=noise noise_mode=normal noise_period=4 vol_env=[12,10,6,2] note=C4');
  }
  return lines;
}

export function emitKitLines(chip: MidiChipId, options: MidiConvertOptions): string[] {
  if (chip === 'nes') return nesKitLines(options);
  return [...GB_KIT_LINES];
}

/** Instrument names that must appear for named drum tokens. */
export function requiredDrumInstruments(): string[] {
  return ['kick', 'snare', 'hihat'];
}
