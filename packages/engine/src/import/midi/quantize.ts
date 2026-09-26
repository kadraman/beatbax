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
 * In quantize mode `strict`, off-grid positions push an error diagnostic and still
 * snap to the nearest grid. Throws only when `options.strict` is also set
 * (CLI `--strict`); otherwise callers may inspect diagnostics and continue.
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
    const rem = Math.abs(continuousTicks / gridTicks - Math.round(continuousTicks / gridTicks));
    if (rem > 1e-4) {
      const msg = `Strict quantize: ${context} at ${continuousTicks.toFixed(3)} ticks is off ${options.quantize.grid} grid`;
      diagnostics.push({ level: 'error', code: 'quantize_strict', message: msg });
      if (options.strict) {
        throw new Error(msg);
      }
    }
  } else if (absShift > options.quantize.maxShiftTicks + 1e-6) {
    diagnostics.push({
      level: 'warn',
      code: 'quantize_clamp',
      message: `Quantize shift ${absShift.toFixed(2)} exceeds maxShiftTicks=${options.quantize.maxShiftTicks} for ${context}; clamping`,
    });
    // Move toward the grid by at most maxShiftTicks — do not re-apply the
    // mode (that can snap past the guardrail back to the original grid point).
    const clampedShift = Math.sign(shift) * Math.min(absShift, options.quantize.maxShiftTicks);
    const tick = Math.max(0, Math.round(continuousTicks + clampedShift));
    return { tick, shift: tick - continuousTicks };
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
