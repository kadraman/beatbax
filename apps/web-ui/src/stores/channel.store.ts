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

function makeDefaultChannel(id: number): ChannelInfo {
  return { id, muted: false, soloed: false, volume: 1.0 };
}

/** Load persisted state from localStorage. Returns only the channels that were saved. */
function loadChannels(): Record<number, ChannelInfo> {
  const base: Record<number, ChannelInfo> = {};
  // Seed at least 4 channels so gameboy songs work without a parse:success event
  for (let i = 1; i <= 4; i++) base[i] = makeDefaultChannel(i);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Array<ChannelInfo>;
    if (Array.isArray(saved)) {
      for (const ch of saved) {
        if (ch.id >= 1) {
          base[ch.id] = { ...makeDefaultChannel(ch.id), ...ch };
        }
      }
    }
  } catch { /* ignore */ }
  return base;
}

/**
 * Ensure the store has entries for all provided channel IDs.
 * Called after a successful parse so per-song channel counts are reflected.
 * Preserves existing mute/solo/volume state for channels already in the store.
 */
export function ensureChannels(ids: number[]): void {
  const current = channelStates.get();
  let changed = false;
  const next = { ...current };
  for (const id of ids) {
    if (!next[id]) {
      next[id] = makeDefaultChannel(id);
      changed = true;
    }
  }
  if (changed) channelStates.set(next);
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
  channelStates.setKey(id, {
    ...current[id],
    muted,
    // A muted channel cannot stay soloed.
    soloed: muted ? false : current[id].soloed,
  });
}

export function setChannelSoloed(id: number, soloed: boolean): void {
  const current = channelStates.get();
  channelStates.setKey(id, {
    ...current[id],
    soloed,
    // A soloed channel must be audible.
    muted: soloed ? false : current[id].muted,
  });
}

export function setChannelVolume(id: number, volume: number): void {
  const current = channelStates.get();
  channelStates.setKey(id, { ...current[id], volume: Math.max(0, Math.min(1, volume)) });
}

export function resetChannels(): void {
  const base: Record<number, ChannelInfo> = {};
  for (let i = 1; i <= 4; i++) base[i] = makeDefaultChannel(i);
  channelStates.set(base);
}

/** Toggle mute for a single channel. Auto-creates the entry if absent. */
export function toggleChannelMuted(id: number): void {
  const current = channelStates.get();
  if (!current[id]) channelStates.setKey(id, makeDefaultChannel(id));
  setChannelMuted(id, !(channelStates.get()[id].muted));
}

/**
 * Toggle solo for a channel. Auto-creates the entry if absent.
 * Soloing a channel unsolos all others; unsoloing clears solo for just that channel.
 */
export function toggleChannelSoloed(id: number): void {
  const current = channelStates.get();
  if (!current[id]) channelStates.setKey(id, makeDefaultChannel(id));
  const wasSoloed = channelStates.get()[id]?.soloed ?? false;
  if (wasSoloed) {
    setChannelSoloed(id, false);
  } else {
    // Solo this channel, unsolo all others.
    // Soloing implies audibility, so the selected channel is auto-unmuted.
    const latest = channelStates.get();
    for (const chId of Object.keys(latest).map(Number)) {
      const info = latest[chId];
      channelStates.setKey(chId, {
        ...info,
        soloed: chId === id,
        muted: chId === id ? false : info.muted,
      });
    }
  }
}

/**
 * Returns true when a channel should be audible (not muted, or is the soloed channel).
 */
export function isChannelAudible(states: Record<number, ChannelInfo>, id: number): boolean {
  const ch = states[id];
  // If the channel isn't in the store yet, treat it as audible (not muted/soloed)
  if (!ch) return true;
  if (ch.muted) return false;
  const anySoloed = Object.values(states).some(c => c.soloed);
  if (!anySoloed) return true;
  return ch.soloed;
}

/** Unmute every channel that is currently muted. */
export function unmuteAll(): void {
  const states = channelStates.get();
  for (const id of Object.keys(states).map(Number)) {
    if (states[id].muted) setChannelMuted(id, false);
  }
}

/** Remove solo from every channel. */
export function clearAllSolo(): void {
  const states = channelStates.get();
  for (const id of Object.keys(states).map(Number)) {
    if (states[id].soloed) setChannelSoloed(id, false);
  }
}
