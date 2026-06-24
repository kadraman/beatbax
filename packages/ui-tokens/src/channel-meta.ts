export interface ChannelMeta {
  /** Short human-readable label shown in mixer and visualization UI. */
  label: string;
  /** CSS hex colour used for level bars, waveforms, and pattern blocks. */
  color: string;
}

export const CHANNEL_COLORS = {
  ch1: '#569cd6',
  ch2: '#9cdcfe',
  ch3: '#4ec9b0',
  ch4: '#ce9178',
  ch5: '#dcdcaa',
  ch6: '#c586c0',
  ch7: '#6a9955',
  ch8: '#f44747',
} as const;

const CHIP_CHANNEL_META: Record<string, ChannelMeta[]> = {
  gameboy: [
    { label: 'Pulse 1', color: CHANNEL_COLORS.ch1 },
    { label: 'Pulse 2', color: CHANNEL_COLORS.ch2 },
    { label: 'Wave', color: CHANNEL_COLORS.ch3 },
    { label: 'Noise', color: CHANNEL_COLORS.ch4 },
  ],
  gb: [],
  dmg: [],
  nes: [
    { label: 'Pulse 1', color: CHANNEL_COLORS.ch1 },
    { label: 'Pulse 2', color: CHANNEL_COLORS.ch2 },
    { label: 'Triangle', color: CHANNEL_COLORS.ch3 },
    { label: 'Noise', color: CHANNEL_COLORS.ch4 },
    { label: 'DMC', color: CHANNEL_COLORS.ch5 },
  ],
  sid: [
    { label: 'Voice 1', color: CHANNEL_COLORS.ch1 },
    { label: 'Voice 2', color: CHANNEL_COLORS.ch2 },
    { label: 'Voice 3', color: CHANNEL_COLORS.ch3 },
  ],
  genesis: [
    { label: 'FM 1', color: CHANNEL_COLORS.ch1 },
    { label: 'FM 2', color: CHANNEL_COLORS.ch2 },
    { label: 'FM 3', color: CHANNEL_COLORS.ch3 },
    { label: 'FM 4', color: CHANNEL_COLORS.ch4 },
    { label: 'FM 5', color: CHANNEL_COLORS.ch5 },
    { label: 'FM 6', color: CHANNEL_COLORS.ch6 },
    { label: 'PSG 1', color: CHANNEL_COLORS.ch7 },
    { label: 'PSG 2', color: CHANNEL_COLORS.ch8 },
    { label: 'PSG 3', color: '#b5cea8' },
    { label: 'Noise', color: '#4fc1ff' },
  ],
  snes: [
    { label: 'Ch 1', color: CHANNEL_COLORS.ch1 },
    { label: 'Ch 2', color: CHANNEL_COLORS.ch2 },
    { label: 'Ch 3', color: CHANNEL_COLORS.ch3 },
    { label: 'Ch 4', color: CHANNEL_COLORS.ch4 },
    { label: 'Ch 5', color: CHANNEL_COLORS.ch5 },
    { label: 'Ch 6', color: CHANNEL_COLORS.ch6 },
    { label: 'Ch 7', color: CHANNEL_COLORS.ch7 },
    { label: 'Ch 8', color: CHANNEL_COLORS.ch8 },
  ],
};

CHIP_CHANNEL_META.gb = CHIP_CHANNEL_META.gameboy;
CHIP_CHANNEL_META.dmg = CHIP_CHANNEL_META.gameboy;

const FALLBACK_COLOR_PALETTE: readonly string[] = [
  CHANNEL_COLORS.ch1, CHANNEL_COLORS.ch2, CHANNEL_COLORS.ch3, CHANNEL_COLORS.ch4,
  CHANNEL_COLORS.ch5, CHANNEL_COLORS.ch6, CHANNEL_COLORS.ch7, CHANNEL_COLORS.ch8,
  '#b5cea8', '#4fc1ff', '#e8c07d', '#a8cc8c',
];

function fallbackColor(channelId: number): string {
  return FALLBACK_COLOR_PALETTE[(channelId - 1) % FALLBACK_COLOR_PALETTE.length] ?? CHANNEL_COLORS.ch1;
}

export function getChannelMeta(chip: string, channelId: number): ChannelMeta {
  const chipKey = (chip ?? 'gameboy').toLowerCase();
  const list = CHIP_CHANNEL_META[chipKey];
  if (list && list.length > 0) {
    const entry = list[channelId - 1];
    if (entry) return entry;
  }
  return { label: `Ch ${channelId}`, color: fallbackColor(channelId) };
}

export function getChannelColor(chip: string, channelId: number): string {
  return getChannelMeta(chip, channelId).color;
}
