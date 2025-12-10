import { exportMIDI } from '../src/export/midiExport';
import { readFileSync, unlinkSync } from 'fs';
import path from 'path';

describe('MIDI Exporter', () => {
  const out = path.resolve(__dirname, '..', 'tmp_test_out.mid');

  afterEach(() => {
    try { unlinkSync(out); } catch (_) {}
  });

  test('writes valid MIDI header and a track with tempo and note events', async () => {
    const song: any = {
      pats: {},
      insts: {},
      seqs: {},
      bpm: 120,
      channels: [
        { id: 1, events: [{ type: 'note', token: 'C4' }] },
        { id: 2, events: [{ type: 'rest' }] }
      ]
    };

    await exportMIDI(song, out);

    const buf = readFileSync(out);
    // Check header 'MThd'
    expect(buf.slice(0,4).toString('ascii')).toBe('MThd');
    // header length 6
    expect(buf.readUInt32BE(4)).toBe(6);
    // format 1
    expect(buf.readUInt16BE(8)).toBe(1);
    // number of tracks (2 channels -> 2 tracks)
    expect(buf.readUInt16BE(10)).toBe(2);
    // ticks per quarter (480)
    expect(buf.readUInt16BE(12)).toBe(480);

    // There should be two 'MTrk' chunks present
    const str = buf.toString('ascii');
    const mtrkCount = (str.match(/MTrk/g) || []).length;
    expect(mtrkCount).toBe(2);

    // Find tempo meta event 0xFF 0x51 0x03
    const tempoIdx = buf.indexOf(Buffer.from([0xff, 0x51, 0x03]));
    expect(tempoIdx).toBeGreaterThan(0);
    // Check that tempo value corresponds to 500000 (120 BPM)
    const mpq = buf.readUIntBE(tempoIdx + 3, 3);
    expect(mpq).toBe(500000);

    // Search for a Note On (0x90) followed by note byte 60 (C4) somewhere in the file
    const noteOnIdx = buf.indexOf(Buffer.from([0x90, 60]));
    expect(noteOnIdx).toBeGreaterThan(0);
  }, 10000);
});
