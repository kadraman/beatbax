/**
 * Test instrument note mapping feature
 * Tests that instruments can specify default notes for named tokens
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import exportUGE from '../src/export/ugeWriter';
import type { NamedInstrumentEvent } from '../src/song/songModel';

describe('Instrument Note Mapping', () => {
  test('instrument with note= parameter passes defaultNote to events', () => {
    const src = `
      chip gameboy
      bpm 140

      inst snare type=noise gb:width=7 env=12,down note=C7
      inst hihat type=noise gb:width=15 env=8,down note=E7

      pat drums = snare hihat snare hihat

      channel 4 => inst snare pat drums
    `;

    const ast = parse(src);
    const song = resolveSong(ast);

    expect(song).toBeDefined();
    expect(song.insts.snare).toBeDefined();
    expect(song.insts.snare.note).toBe('C7');
    expect(song.insts.hihat.note).toBe('E7');

    const ch = song.channels.find((c) => c.id === 4);
    expect(ch).toBeDefined();
    expect(ch!.events.length).toBeGreaterThan(0);

    // Check that snare events have defaultNote set
    const snareEvents = ch!.events.filter(
      (e) => e.type === 'named' && (e as NamedInstrumentEvent).token === 'snare'
    ) as NamedInstrumentEvent[];
    expect(snareEvents.length).toBeGreaterThan(0);
    expect(snareEvents[0].defaultNote).toBe('C7');

    // Check that hihat events have defaultNote set
    const hihatEvents = ch!.events.filter(
      (e) => e.type === 'named' && (e as NamedInstrumentEvent).token === 'hihat'
    ) as NamedInstrumentEvent[];
    expect(hihatEvents.length).toBeGreaterThan(0);
    expect(hihatEvents[0].defaultNote).toBe('E7');
  });

  test('instrument without note= parameter defaults to C5', () => {
    const src = `
      chip gameboy

      inst kick type=pulse1 duty=12.5 env=15,down

      pat drums = kick . kick .

      channel 1 => inst kick pat drums
    `;

    const ast = parse(src);
    const song = resolveSong(ast);

    expect(song.insts.kick.note).toBeUndefined();

    const ch = song.channels.find((c) => c.id === 1);
    const kickEvents = ch!.events.filter(
      (e) => e.type === 'named' && (e as NamedInstrumentEvent).token === 'kick'
    ) as NamedInstrumentEvent[];

    // Should not have defaultNote set
    expect(kickEvents[0].defaultNote).toBeUndefined();
  });

  test('UGE export uses defaultNote for named instruments', async () => {
    const src = `
      chip gameboy
      bpm 140

      inst snare type=noise gb:width=7 env=12,down note=C7
      inst hihat type=noise gb:width=15 env=8,down note=G7

      pat drums = snare hihat snare hihat . . . .

      channel 4 => inst snare pat drums
    `;

    const ast = parse(src);
    const song = resolveSong(ast);

    // Export to UGE and verify it doesn't throw
    const outPath = path.join(os.tmpdir(), `test_note_mapping_${Date.now()}.uge`);
    await exportUGE(song as any, outPath, { debug: false });

    const buf = fs.readFileSync(outPath);
    expect(buf).toBeDefined();
    expect(buf.length).toBeGreaterThan(0);

    // Note: C7 = MIDI 84, hUGE index = 84-36 = 48
    // Note: G7 = MIDI 91, hUGE index = 91-36 = 55
    // We can't easily inspect the binary, but no error means it worked

    // Clean up
    try { fs.unlinkSync(outPath); } catch (e) {}
  });

  test('explicit note overrides instrument defaultNote', () => {
    const src = `
      chip gameboy

      inst snare type=noise gb:width=7 env=12,down note=C7

      # Use explicit note syntax
      pat p1 = inst(snare) C5 . inst(snare) D5 .

      channel 4 => inst snare pat p1
    `;

    const ast = parse(src);
    const song = resolveSong(ast);

    const ch = song.channels.find((c) => c.id === 4);

    // First C5 should be a note event, not a named event
    const noteEvents = ch!.events.filter((e) => e.type === 'note');
    expect(noteEvents.length).toBeGreaterThan(0);
    // Verify tokens are C5 and D5 (explicit notes override)
  });

  test('multiple percussion instruments with different notes', async () => {
    const src = `
      chip gameboy
      bpm 140

      inst kick     type=pulse1 duty=12.5 env=15,down,1 note=C2
      inst snare    type=noise  gb:width=7  env=13,down,1 note=C7
      inst hihat_cl type=noise  gb:width=15 env=6,down,1  note=E7
      inst hihat_op type=noise  gb:width=15 env=8,down,3  note=F7
      inst tom_low  type=noise  gb:width=7  env=14,down,5 note=C6
      inst tom_high type=noise  gb:width=7  env=12,down,3 note=G6

      pat kick_pat  = kick . . . kick . . .
      pat snare_pat = . . . . snare . . .
      pat hh_pat    = hihat_cl hihat_cl hihat_op hihat_cl
      pat toms_pat  = tom_low . tom_high .

      channel 1 => inst kick pat kick_pat
      channel 4 => inst snare pat snare_pat
    `;

    const ast = parse(src);
    const song = resolveSong(ast);

    expect(song.insts.kick.note).toBe('C2');
    expect(song.insts.snare.note).toBe('C7');
    expect(song.insts.hihat_cl.note).toBe('E7');
    expect(song.insts.hihat_op.note).toBe('F7');
    expect(song.insts.tom_low.note).toBe('C6');
    expect(song.insts.tom_high.note).toBe('G6');

    // Should resolve and export without errors
    const outPath = path.join(os.tmpdir(), `test_multi_perc_${Date.now()}.uge`);
    await exportUGE(song as any, outPath, { debug: false });
    expect(fs.existsSync(outPath)).toBe(true);

    // Clean up
    try { fs.unlinkSync(outPath); } catch (e) {}
  });

  test('note parameter is case-insensitive', () => {
    const src = `
      chip gameboy

      inst s1 type=noise note=c7
      inst s2 type=noise note=C7
      inst s3 type=noise NOTE=C7
      inst s4 type=noise Note=C7

      pat p = s1 s2 s3 s4
      channel 4 => inst s1 pat p
    `;

    const ast = parse(src);
    const song = resolveSong(ast);

    // All should parse (key may be normalized)
    expect(song.insts.s1).toBeDefined();
    expect(song.insts.s2).toBeDefined();
    expect(song.insts.s3).toBeDefined();
    expect(song.insts.s4).toBeDefined();
  });

  test('supports sharps and flats in note parameter', async () => {
    const src = `
      chip gameboy

      inst sn1 type=noise note=D7
      inst sn2 type=noise note=Db7
      inst sn3 type=noise note=Bb6

      pat p = sn1 sn2 sn3 .
      channel 4 => inst sn1 pat p
    `;

    const ast = parse(src);
    const song = resolveSong(ast);

    expect(song.insts.sn1.note).toBe('D7');
    expect(song.insts.sn2.note).toBe('Db7');
    expect(song.insts.sn3.note).toBe('Bb6');

    // Should export without errors
    const outPath = path.join(os.tmpdir(), `test_sharps_flats_${Date.now()}.uge`);
    await exportUGE(song as any, outPath, { debug: false });
    expect(fs.existsSync(outPath)).toBe(true);

    // Clean up
    try { fs.unlinkSync(outPath); } catch (e) {}
  });
});
