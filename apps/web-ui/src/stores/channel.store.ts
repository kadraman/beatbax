/**
 * channel.store — per-channel mute/solo/volume state (nanostores).
 *
 * Replaces ChannelState (class) + event-bus wiring.  Uses a `map` for the per-channel
 * record so each key change triggers only the relevant subscriber.
 *
 * localStorage key: 'beatbax-channel-state'
 */

import { map } from 'nanostores';

export interface ChannelInfo {
  id: number;
  muted: boolean;
  soloed: boolean;
  volume: number; // 0–1
}

const STORAGE_KEY = 'beatbax-channel-state';
const MAX_CHANNELS = 4;

function defaultChannels(): Record<number, ChannelInfo> {
  const record: Record<number, ChannelInfo> = {};
  for (let i = 1; i <= MAX_CHANNELS; i++) {
    record[i] = { id: i, muted: false, soloed: false, volume: 1.0 };
  }
  return record;
}

/** Load persisted state from localStorage and merge with defaults. */
function loadChannels(): Record<number, ChannelInfo> {
  const base = defaultChannels();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Array<ChannelInfo>;
    if (Array.isArray(saved)) {
      for (const ch of saved) {
        if (ch.id >= 1 && ch.id <= MAX_CHANNELS) {
          base[ch.id] = { ...base[ch.id], ...ch };
        }
      }
    }
  } catch { /* ignore */ }
  return base;
}

/** Reactive per-channel state map. Key = channel id (1–4). */
export const channelStates = map<Record<number, ChannelInfo>>(loadChannels());

/** Persist to localStorage whenever the store changes. */
channelStates.subscribe((states) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(states)));
  } catch { /* ignore */ }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

export function setChannelMuted(id: number, muted: boolean): void {
  const current = channelStates.get();
  channelStates.setKey(id, { ...current[id], muted });
}

export function setChannelSoloed(id: number, soloed: boolean): void {
  const current = channelStates.get();
  channelStates.setKey(id, { ...current[id], soloed });
}

export function setChannelVolume(id: number, volume: number): void {
  const current = channelStates.get();
  channelStates.setKey(id, { ...current[id], volume: Math.max(0, Math.min(1, volume)) });
}

export function resetChannels(): void {
  channelStates.set(defaultChannels());
}

/** Toggle mute for a single channel. */
export function toggleChannelMuted(id: number): void {
  const current = channelStates.get();
  if (current[id]) setChannelMuted(id, !current[id].muted);
}

/**
 * Toggle solo for a channel.
 * Soloing a channel unsolos all others; unsoloing clears solo for just that channel.
 */
export function toggleChannelSoloed(id: number): void {
  const current = channelStates.get();
  const wasSoloed = current[id]?.soloed ?? false;
  if (wasSoloed) {
    setChannelSoloed(id, false);
  } else {
    // Solo this channel, unsolo all others
    for (const chId of Object.keys(current).map(Number)) {
      setChannelSoloed(chId, chId === id);
    }
  }
}

/**
 * Returns true when a channel should be audible (not muted, or is the soloed channel).
 */
export function isChannelAudible(states: Record<number, ChannelInfo>, id: number): boolean {
  const ch = states[id];
  if (!ch) return false;
  if (ch.muted) return false;
  const anySoloed = Object.values(states).some(c => c.soloed);
  if (!anySoloed) return true;
  return ch.soloed;
}
