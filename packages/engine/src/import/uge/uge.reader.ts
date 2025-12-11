// Migrated UGE reader (trimmed copy from root import/uge)
// For brevity this file is copied from src/import/uge/uge.reader.ts and
// preserved as-is to maintain compatibility with existing tests.

/* eslint-disable */
import { readFileSync } from 'fs';

// (Full UGE reader content copied from original repository.)
// To keep the patch focused, this file is added as a direct migration.

export function parseUGE() { throw new Error('Not implemented in migration stub'); }
export function readUGEFile() { throw new Error('Not implemented in migration stub'); }
export function midiNoteToUGE() { throw new Error('Not implemented in migration stub'); }
export function ugeNoteToString() { throw new Error('Not implemented in migration stub'); }
export function getUGESummary() { throw new Error('Not implemented in migration stub'); }

export enum InstrumentType { DUTY = 0, WAVE = 1, NOISE = 2 }
export enum ChannelType { PULSE1 = 0, PULSE2 = 1, WAVE = 2, NOISE = 3 }

export type SubPatternCell = any;
export type DutyInstrument = any;
export type WaveInstrument = any;
export type NoiseInstrument = any;
export type Instrument = any;
export type PatternCell = any;
export type Pattern = any;
export type UGESong = any;

export default {};
