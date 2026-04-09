/**
 * chip-meta — per-chip channel metadata (labels and colours).
 *
 * Used by ChannelMixer and PatternGrid so both panels show consistent
 * channel names and colours regardless of which sound chip is active.
 *
 * Adding support for a new chip only requires a new entry in CHIP_CHANNEL_META.
 * For channels beyond the defined list, a generic fallback is generated.
 */

export interface ChannelMeta {
  /** Short human-readable label shown in the mixer / pattern grid. */
  label: string;
  /** CSS hex colour used for the level bar, waveform, and pattern block. */
  color: string;
}

// ── Per-chip channel definitions ─────────────────────────────────────────────

/** Map of chip name (lowercase) → ordered channel metadata (index = channelId - 1). */
const CHIP_CHANNEL_META: Record<string, ChannelMeta[]> = {
  gameboy: [
    { label: 'Pulse 1', color: '#569cd6' }, // ch 1 — square, blue
    { label: 'Pulse 2', color: '#9cdcfe' }, // ch 2 — square, light blue
    { label: 'Wave',    color: '#4ec9b0' }, // ch 3 — wavetable, teal
    { label: 'Noise',   color: '#ce9178' }, // ch 4 — LFSR noise, salmon
  ],
  // Aliases recognised by the parser
  gb:  [], // resolved to gameboy below
  dmg: [], // resolved to gameboy below

  nes: [
    { label: 'Pulse 1',   color: '#569cd6' }, // ch 1
    { label: 'Pulse 2',   color: '#9cdcfe' }, // ch 2
    { label: 'Triangle',  color: '#4ec9b0' }, // ch 3
    { label: 'Noise',     color: '#ce9178' }, // ch 4
    { label: 'DMC',       color: '#dcdcaa' }, // ch 5 — sample
  ],

  sid: [
    { label: 'Voice 1', color: '#569cd6' },
    { label: 'Voice 2', color: '#9cdcfe' },
    { label: 'Voice 3', color: '#4ec9b0' },
  ],

  genesis: [
    { label: 'FM 1',  color: '#569cd6' },
    { label: 'FM 2',  color: '#9cdcfe' },
    { label: 'FM 3',  color: '#4ec9b0' },
    { label: 'FM 4',  color: '#ce9178' },
    { label: 'FM 5',  color: '#dcdcaa' },
    { label: 'FM 6',  color: '#c586c0' },
    { label: 'PSG 1', color: '#6a9955' },
    { label: 'PSG 2', color: '#f44747' },
    { label: 'PSG 3', color: '#b5cea8' },
    { label: 'Noise', color: '#4fc1ff' },
  ],

  snes: [
    { label: 'Ch 1', color: '#569cd6' },
    { label: 'Ch 2', color: '#9cdcfe' },
    { label: 'Ch 3', color: '#4ec9b0' },
    { label: 'Ch 4', color: '#ce9178' },
    { label: 'Ch 5', color: '#dcdcaa' },
    { label: 'Ch 6', color: '#c586c0' },
    { label: 'Ch 7', color: '#6a9955' },
    { label: 'Ch 8', color: '#f44747' },
  ],
};

// Resolve chip aliases
CHIP_CHANNEL_META['gb']  = CHIP_CHANNEL_META['gameboy'];
CHIP_CHANNEL_META['dmg'] = CHIP_CHANNEL_META['gameboy'];

// ── Fallback colour palette (for unknown chips or extra channels) ─────────────

/**
 * Deterministic colour palette used when a chip has no entry in CHIP_CHANNEL_META
 * or when the channel ID exceeds the defined list.
 */
const FALLBACK_COLOR_PALETTE: readonly string[] = [
  '#569cd6', '#9cdcfe', '#4ec9b0', '#ce9178',
  '#dcdcaa', '#c586c0', '#6a9955', '#f44747',
  '#b5cea8', '#4fc1ff', '#e8c07d', '#a8cc8c',
];

function fallbackColor(channelId: number): string {
  return FALLBACK_COLOR_PALETTE[(channelId - 1) % FALLBACK_COLOR_PALETTE.length];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the ChannelMeta for a given chip and 1-based channel ID.
 * Falls back gracefully for unknown chips or channel IDs beyond the defined list.
 */
export function getChannelMeta(chip: string, channelId: number): ChannelMeta {
  const chipKey = (chip ?? 'gameboy').toLowerCase();
  const list = CHIP_CHANNEL_META[chipKey];
  if (list && list.length > 0) {
    const entry = list[channelId - 1];
    if (entry) return entry;
    // Channel beyond defined list for this chip — generate a generic entry
    return { label: `Ch ${channelId}`, color: fallbackColor(channelId) };
  }
  // Unknown chip — generate a fully generic entry
  return { label: `Ch ${channelId}`, color: fallbackColor(channelId) };
}

/**
 * Return just the colour for a given chip and 1-based channel ID.
 * Convenience wrapper used by PatternGrid.
 */
export function getChannelColor(chip: string, channelId: number): string {
  return getChannelMeta(chip, channelId).color;
}
