import { gameboyInstrumentEditor } from '../../engine/src/chips/gameboy/instrument-editor';
import { nesInstrumentEditor } from '../../engine/src/chips/nes/instrument-editor';
import { smsInstrumentEditor } from '../../../packages/plugins/chip-sms/src/instrument-editor';
import type { ChipInstrumentTypeDef } from '@beatbax/engine/chips';
import {
  estimateInstrumentHitDurationSec,
  hitOneshotPreviewTiming,
  melodicPreviewNotesForOctave,
  resolveBundledSampleMeta,
  resolvePreviewMode,
  resolvePreviewOctave,
  ugeNotePreviewStrip,
} from '../src/editor/instrument-editor-schema';

function byId(types: ChipInstrumentTypeDef[]): Record<string, ChipInstrumentTypeDef> {
  return Object.fromEntries(types.map((t) => [t.id, t]));
}

describe('instrument preview pitch (098)', () => {
  test('GB / NES / SMS type schemas set previewMode and previewOctave', () => {
    const gb = byId(gameboyInstrumentEditor.types);
    expect(gb.pulse1?.previewMode).toBe('melodic');
    expect(gb.pulse1?.previewOctave).toBe(4);
    expect(gb.wave?.previewOctave).toBe(2);
    expect(gb.noise?.previewMode).toBe('uge_note');

    const nes = byId(nesInstrumentEditor.types);
    expect(nes.triangle?.previewOctave).toBe(2);
    expect(nes.noise?.previewMode).toBe('oneshot');
    expect(nes.dmc?.previewMode).toBe('oneshot');

    // SMS SN76489: octave 2 collapses C2–G#2 to the same period; tone3 defaults to 3.
    const sms = byId(smsInstrumentEditor.types);
    expect(sms.tone3?.previewOctave).toBe(3);
    expect(sms.tone1?.previewOctave).toBe(4);
    expect(sms.noise?.previewMode).toBe('oneshot');
  });

  test('resolvePreviewOctave prefers note= then type default then 4', () => {
    expect(resolvePreviewOctave(undefined, 'wave', 'gameboy', gameboyInstrumentEditor)).toBe(2);
    expect(resolvePreviewOctave('C3', 'wave', 'gameboy', gameboyInstrumentEditor)).toBe(3);
    expect(resolvePreviewOctave('C9', 'wave', 'gameboy', gameboyInstrumentEditor)).toBe(2);
    expect(resolvePreviewOctave(undefined, 'pulse1', 'gameboy', gameboyInstrumentEditor)).toBe(4);
    expect(resolvePreviewOctave(undefined, 'unknown', 'gameboy')).toBe(4);
  });

  test('resolvePreviewMode defaults to melodic', () => {
    expect(resolvePreviewMode('noise', 'gameboy', gameboyInstrumentEditor)).toBe('uge_note');
    expect(resolvePreviewMode('dmc', 'nes', nesInstrumentEditor)).toBe('oneshot');
    expect(resolvePreviewMode('mystery', 'gameboy')).toBe('melodic');
  });

  test('tone_mix=true forces oneshot (Spectrum percussion on tone channels)', () => {
    expect(resolvePreviewMode('tone3', 'spectrum-128', undefined, { tone_mix: true })).toBe('oneshot');
    expect(resolvePreviewMode('tone3', 'spectrum-128', undefined, { tone_mix: 'true' })).toBe('oneshot');
    expect(resolvePreviewMode('tone3', 'spectrum-128', undefined, { tone_mix: 1 })).toBe('oneshot');
    expect(resolvePreviewMode('tone3', 'spectrum-128', undefined, { tone_mix: '1' })).toBe('oneshot');
    expect(resolvePreviewMode('tone3', 'spectrum-128', undefined, { tone_mix: false })).toBe('melodic');
    expect(resolvePreviewMode('tone3', 'spectrum-128', undefined, { tone_mix: 0 })).toBe('melodic');
    expect(resolvePreviewMode('tone3', 'spectrum-128', undefined, { tone_mix: '0' })).toBe('melodic');
    expect(resolvePreviewMode('tone1', 'spectrum-128')).toBe('melodic');
  });

  test('melodicPreviewNotesForOctave centres on type octave', () => {
    expect(melodicPreviewNotesForOctave(2)).toEqual(['C2', 'C3', 'C4']);
    expect(melodicPreviewNotesForOctave(4)).toEqual(['C2', 'C3', 'C4', 'C5', 'C6']);
    expect(melodicPreviewNotesForOctave(7)).toEqual(['C5', 'C6', 'C7']);
  });

  test('ugeNotePreviewStrip is C-3…C-9', () => {
    expect(ugeNotePreviewStrip()).toEqual(['C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9']);
  });

  test('resolveBundledSampleMeta reads plugin meta for @nes/ refs', () => {
    expect(resolveBundledSampleMeta('nes', '@nes/bass_c2')).toEqual({
      designedRate: 15,
      baseNote: 'C2',
    });
    expect(resolveBundledSampleMeta('nes', 'local:kick.dmc')).toBeNull();
  });

  test('hit oneshot duration follows vol_env length (not a long DMC window)', () => {
    const crash = {
      type: 'noise',
      noise_mode: 'normal',
      noise_period: 3,
      vol_env: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      note: 'C5',
    };
    const dur = estimateInstrumentHitDurationSec(crash);
    expect(dur).toBeGreaterThan(0.15);
    expect(dur).toBeLessThan(0.5);
    const timing = hitOneshotPreviewTiming(crash);
    expect(timing.steps).toBe(1);
    expect(timing.bpm).toBeGreaterThan(60);
    expect(timing.stopAfterMs).toBeLessThan(1000);

    expect(estimateInstrumentHitDurationSec({ type: 'dmc' })).toBe(16);
    expect(hitOneshotPreviewTiming({ type: 'dmc' }).steps).toBe(16);
  });
});
