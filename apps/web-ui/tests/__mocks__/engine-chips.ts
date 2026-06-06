/** Jest mock for @beatbax/engine/chips — avoids loading ESM dist in tests. */

import { gameboyUIContributions } from '../../../../packages/engine/src/chips/gameboy/ui-contributions';
import { nesUIContributions } from '../../../../packages/engine/src/chips/nes/ui-contributions';
import { smsUIContributions } from '../../../../packages/plugins/chip-sms/src/ui-contributions';

/** Minimal spectrum hover docs for tests (full plugin imports platform-profiles.js). */
const spectrumTestHoverDocs = {
  type: [
    '**Channel type** — selects which AY-3-8912 tone/noise voice this instrument drives.',
    '```\ntype=<tone1|tone2|tone3>\n```',
  ].join('\n'),
  vol: [
    '**vol** — Fixed channel amplitude (0–15).',
    '',
    'Use when you do not need envelope shaping.',
  ].join('\n'),
  tone1: '**Tone 1** — AY-3-8912 square-wave channel A (BeatBax channel 1).',
  tone2: '**Tone 2** — AY-3-8912 square-wave channel B (BeatBax channel 2).',
  tone3: '**Tone 3** — AY-3-8912 square-wave channel C (BeatBax channel 3).',
  vol_env: '**vol_env** — Hardware envelope program on AY R11–R13.',
  tone_mix: '**tone_mix** — Enable noise mixing for this channel (R7 mixer bit).',
  noise_rate: '**noise_rate** — AY R6 noise period (0–31).',
};

const aliases: Record<string, string> = {
  gb: 'gameboy',
  dmg: 'gameboy',
  famicom: 'nes',
  gg: 'sms',
  gamegear: 'sms',
  ay: 'spectrum-128',
  spectrum: 'spectrum-128',
  cpc: 'spectrum-128',
  'amstrad-cpc': 'spectrum-128',
};

const plugins = new Map<string, {
  effects?: Record<string, unknown>;
  supportsPerChannelVolume?: boolean;
  uiContributions?: { hoverDocs?: Record<string, string> };
}>();

export class ChipRegistry {
  resolve(name: string): string {
    return aliases[name] ?? name;
  }

  get(name: string) {
    return plugins.get(this.resolve(name));
  }

  has(name: string): boolean {
    return plugins.has(this.resolve(name));
  }

  register(plugin: {
    name: string;
    effects?: Record<string, unknown>;
    supportsPerChannelVolume?: boolean;
    uiContributions?: { hoverDocs?: Record<string, string> };
  }) {
    plugins.set(plugin.name, plugin);
  }

  list(): string[] {
    return ['gameboy', 'gb', 'dmg', 'nes', 'sms', 'gg', 'gamegear', 'spectrum-128', 'ay', 'spectrum', 'cpc', 'amstrad-cpc'];
  }

  listCanonical(): string[] {
    return ['gameboy', 'nes', 'sms', 'spectrum-128'];
  }

  aliasesFor(_canonical: string): string[] {
    return [];
  }
}

export const chipRegistry = new ChipRegistry();

chipRegistry.register({
  name: 'gameboy',
  supportsPerChannelVolume: false,
  uiContributions: gameboyUIContributions,
});
chipRegistry.register({
  name: 'nes',
  supportsPerChannelVolume: true,
  uiContributions: nesUIContributions,
});
chipRegistry.register({ name: 'sms', uiContributions: smsUIContributions });
chipRegistry.register({ name: 'spectrum-128', uiContributions: { hoverDocs: spectrumTestHoverDocs } });
