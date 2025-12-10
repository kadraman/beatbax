import { exportMIDI } from '../src/export/midiExport';
import { readFileSync, unlinkSync } from 'fs';
import path from 'path';

describe('MIDI Program Change', () => {
  const out = path.resolve(__dirname, '..', 'tmp_pc_out.mid');

  afterEach(() => {
    try { unlinkSync(out); } catch (_) {}
  });

  test('emits Program Change when instrument gm is set', async () => {
    // Build a song where channel 1 has a default instrument with gm=81
    const song: any = {
      pats: {},
      insts: {
        leadA: { type: 'pulse1', duty: '60', env: 'gb:12,down,1', gm: 81 }
      },
      seqs: {},
      bpm: 120,
      channels: [
        { id: 1, defaultInstrument: 'leadA', events: [{ type: 'note', token: 'C4', instrument: 'leadA' }] }
      ]
    };

    await exportMIDI(song, out);
    const buf = readFileSync(out);

    // Program Change message for channel 0 is 0xC0 followed by program byte 81
    const pcIndex = buf.indexOf(Buffer.from([0xC0, 81]));
    expect(pcIndex).toBeGreaterThanOrEqual(0);

    // Ensure program change appears before the note-on for C4 (0x90, 60)
    const noteIdx = buf.indexOf(Buffer.from([0x90, 60]));
    expect(noteIdx).toBeGreaterThan(pcIndex);
  });
});
