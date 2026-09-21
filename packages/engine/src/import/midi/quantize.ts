/**
 * PPQ → BeatBax tick conversion and quantization.
 */
import { gridToTicks } from './config.js';
import type {
  ConversionDiagnostic,
  MidiConvertOptions,
  MidiRawNote,
  QuantizeMode,
  QuantizedNote,
} from './types.js';

export function midiTicksToBaxTicks(midiTicks: number, ppq: number, ticksPerBeat: number): number {
  if (ppq <= 0) return 0;
  return (midiTicks * ticksPerBeat) / ppq;
}

function applyMode(value: number, gridTicks: number, mode: QuantizeMode): number {
  if (gridTicks <= 0) return Math.round(value);
  const ratio = value / gridTicks;
  switch (mode) {
    case 'floor':
      return Math.floor(ratio) * gridTicks;
    case 'ceil':
      return Math.ceil(ratio) * gridTicks;
    case 'nearest':
      return Math.round(ratio) * gridTicks;
    case 'strict':
      return Math.round(ratio) * gridTicks;
    default:
      return Math.round(ratio) * gridTicks;
  }
}

/**
 * Quantize a continuous BeatBax-tick position. Returns quantized value and shift.
 * In strict mode, throws (or pushes error diagnostic) when off-grid beyond epsilon.
 */
export function quantizePosition(
  continuousTicks: number,
  options: MidiConvertOptions,
  diagnostics: ConversionDiagnostic[],
  context: string,
): { tick: number; shift: number } {
  const gridTicks = gridToTicks(options.quantize.grid, options.ticksPerBeat);
  const mode = options.quantize.mode;
  const quantized = applyMode(continuousTicks, gridTicks, mode);
  const shift = quantized - continuousTicks;
  const absShift = Math.abs(shift);

  if (mode === 'strict') {
    const epsilon = 1e-6;
    const onGrid = Math.abs(continuousTicks - quantized) < epsilon || Math.abs(continuousTicks % gridTicks) < epsilon;
    // Prefer checking remainder against grid
    const rem = Math.abs(continuousTicks / gridTicks - Math.round(continuousTicks / gridTicks));
    if (rem > 1e-4) {
      const msg = `Strict quantize: ${context} at ${continuousTicks.toFixed(3)} ticks is off ${options.quantize.grid} grid`;
      diagnostics.push({ level: 'error', code: 'quantize_strict', message: msg });
      if (options.strict || mode === 'strict') {
        throw new Error(msg);
      }
    }
  } else if (absShift > options.quantize.maxShiftTicks + 1e-6) {
    diagnostics.push({
      level: 'warn',
      code: 'quantize_clamp',
      message: `Quantize shift ${absShift.toFixed(2)} exceeds maxShiftTicks=${options.quantize.maxShiftTicks} for ${context}; clamping`,
    });
    // Clamp toward original within maxShiftTicks
    const clampedShift = Math.sign(shift) * Math.min(absShift, options.quantize.maxShiftTicks);
    const clamped = continuousTicks + clampedShift;
    const reQuant = applyMode(clamped, gridTicks, mode);
    return { tick: Math.max(0, Math.round(reQuant)), shift: reQuant - continuousTicks };
  }

  return { tick: Math.max(0, Math.round(quantized)), shift };
}

export function quantizeNotes(
  notes: MidiRawNote[],
  ppq: number,
  options: MidiConvertOptions,
  diagnostics: ConversionDiagnostic[],
): QuantizedNote[] {
  const out: QuantizedNote[] = [];

  for (const n of notes) {
    const startCont = midiTicksToBaxTicks(n.startMidiTicks, ppq, options.ticksPerBeat);
    const durCont = midiTicksToBaxTicks(n.durationMidiTicks, ppq, options.ticksPerBeat);
    const startQ = quantizePosition(
      startCont,
      options,
      diagnostics,
      `note pitch=${n.pitch} track=${n.sourceTrackIndex}`,
    );
    let endCont = startCont + Math.max(durCont, 0);
    const endQ = quantizePosition(
      endCont,
      options,
      diagnostics,
      `note-end pitch=${n.pitch} track=${n.sourceTrackIndex}`,
    );
    let durationTicks = Math.max(1, endQ.tick - startQ.tick);
    // If quantization collapsed duration, keep at least one grid unit
    if (durationTicks < 1) durationTicks = 1;

    out.push({
      startTick: startQ.tick,
      durationTicks,
      pitch: n.pitch,
      velocity: n.velocity,
      midiChannel: n.midiChannel,
      sourceTrackIndex: n.sourceTrackIndex,
      sourceEventIndex: n.sourceEventIndex,
      trackName: n.trackName,
      program: n.program,
      isDrum: n.isDrum,
      shiftTicks: startQ.shift,
    });
  }

  out.sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick;
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    if (a.sourceTrackIndex !== b.sourceTrackIndex) return a.sourceTrackIndex - b.sourceTrackIndex;
    return a.sourceEventIndex - b.sourceEventIndex;
  });

  return out;
}
