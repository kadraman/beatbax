/**
 * Chip role tables for MIDI packing (v1: Game Boy + NES).
 */
import type { ChipRole, MidiChipId } from './types.js';

export interface ChipRoleSlot {
  /** 1-based BeatBax channel index. */
  channelIndex: number;
  role: ChipRole;
  /** Default instrument name for this role. */
  defaultInstrument: string;
  /** Higher = keep first when over-polyphony. */
  priority: number;
  /** Compatible stream classes that may multiplex onto this slot. */
  multiplexGroup: 'melodic-pulse' | 'bass' | 'drums' | 'dmc';
}

export function getChipRoleTable(chip: MidiChipId): ChipRoleSlot[] {
  if (chip === 'nes') {
    return [
      { channelIndex: 1, role: 'pulse1', defaultInstrument: 'lead', priority: 100, multiplexGroup: 'melodic-pulse' },
      { channelIndex: 2, role: 'pulse2', defaultInstrument: 'arp', priority: 80, multiplexGroup: 'melodic-pulse' },
      { channelIndex: 3, role: 'triangle', defaultInstrument: 'bass', priority: 90, multiplexGroup: 'bass' },
      { channelIndex: 4, role: 'noise', defaultInstrument: 'hihat', priority: 50, multiplexGroup: 'drums' },
      { channelIndex: 5, role: 'dmc', defaultInstrument: 'kick', priority: 60, multiplexGroup: 'dmc' },
    ];
  }
  // gameboy
  return [
    { channelIndex: 1, role: 'pulse1', defaultInstrument: 'lead', priority: 100, multiplexGroup: 'melodic-pulse' },
    { channelIndex: 2, role: 'pulse2', defaultInstrument: 'arp', priority: 80, multiplexGroup: 'melodic-pulse' },
    { channelIndex: 3, role: 'wave', defaultInstrument: 'bass', priority: 90, multiplexGroup: 'bass' },
    { channelIndex: 4, role: 'noise', defaultInstrument: 'hihat', priority: 50, multiplexGroup: 'drums' },
  ];
}

export function melodicChannelBudget(chip: MidiChipId): number {
  // Exclude dedicated drum / dmc slots from melodic polyphony budget.
  return getChipRoleTable(chip).filter((s) => s.multiplexGroup === 'melodic-pulse' || s.multiplexGroup === 'bass').length;
}
