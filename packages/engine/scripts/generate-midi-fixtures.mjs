/**
 * Generate synthetic MIDI fixtures F04–F09 for feature 006.
 * Run: node --experimental-vm-modules packages/engine/scripts/generate-midi-fixtures.mjs
 * (or via ts-node / after build)
 */
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../tests/fixtures/midi');
mkdirSync(outDir, { recursive: true });

function write(name, midi) {
  const path = join(outDir, name);
  writeFileSync(path, Buffer.from(midi.toArray()));
  console.log('wrote', path, midi.toArray().length, 'bytes');
}

// F04 — GM drums 36/38/42
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const t = midi.addTrack();
  t.channel = 9;
  t.name = 'Drums';
  // ticks at PPQ 480: 16th = 120
  t.addNote({ midi: 36, ticks: 0, durationTicks: 120 });
  t.addNote({ midi: 42, ticks: 120, durationTicks: 60 });
  t.addNote({ midi: 38, ticks: 240, durationTicks: 120 });
  t.addNote({ midi: 42, ticks: 360, durationTicks: 60 });
  t.addNote({ midi: 36, ticks: 480, durationTicks: 120 });
  t.addNote({ midi: 42, ticks: 600, durationTicks: 60 });
  t.addNote({ midi: 38, ticks: 720, durationTicks: 120 });
  t.addNote({ midi: 42, ticks: 840, durationTicks: 60 });
  write('f04-gm-drums.mid', midi);
}

// F05 — 5 overlapping melodic voices
{
  const midi = new Midi();
  midi.header.setTempo(120);
  for (let i = 0; i < 5; i++) {
    const t = midi.addTrack();
    t.channel = i;
    t.name = `Voice${i}`;
    t.instrument.number = 81;
    t.addNote({ midi: 60 + i, ticks: 0, durationTicks: 960 });
    t.addNote({ midi: 64 + i, ticks: 960, durationTicks: 960 });
  }
  write('f05-overpoly.mid', midi);
}

// F06 — alternating non-overlapping phrases for inst() multiplex
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const a = midi.addTrack();
  a.channel = 0;
  a.name = 'Lead';
  a.instrument.number = 81;
  for (let i = 0; i < 4; i++) {
    a.addNote({ midi: 72, ticks: i * 480, durationTicks: 240 });
  }
  const b = midi.addTrack();
  b.channel = 1;
  b.name = 'Harmony';
  b.instrument.number = 84;
  for (let i = 0; i < 4; i++) {
    b.addNote({ midi: 67, ticks: 1920 + i * 480, durationTicks: 240 });
  }
  write('f06-inst-switch.mid', midi);
}

// F07 — repeating full 16-tick bars (AABA)
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const t = midi.addTrack();
  t.channel = 0;
  t.name = 'Motif';
  t.instrument.number = 81;
  // One bar = 16 BeatBax ticks = 16 * 120 = 1920 MIDI ticks at PPQ 480
  const bar = 1920;
  function addBar(startTick, root) {
    for (let i = 0; i < 16; i++) {
      t.addNote({ midi: root + (i % 4), ticks: startTick + i * 120, durationTicks: 120 });
    }
  }
  addBar(0, 60); // A
  addBar(bar, 60); // A
  addBar(bar * 2, 67); // B
  addBar(bar * 3, 60); // A
  write('f07-reuse.mid', midi);
}

// F08 — off-grid (nudge by 30 ticks ≈ quarter of 16th)
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const t = midi.addTrack();
  t.channel = 0;
  t.name = 'Syncop';
  t.instrument.number = 81;
  t.addNote({ midi: 60, ticks: 30, durationTicks: 120 });
  t.addNote({ midi: 64, ticks: 150, durationTicks: 120 });
  t.addNote({ midi: 67, ticks: 270, durationTicks: 200 });
  write('f08-offgrid.mid', midi);
}

// F09 — true Type-0 SMF (single track, multi-channel) written raw
function vlq(n) {
  const parts = [];
  let v = n;
  parts.push(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    parts.push((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return parts.reverse();
}

function buildFormat0() {
  const ppq = 480;
  const events = [];
  events.push({ tick: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }); // 120 bpm
  const notes = [
    { tick: 0, ch: 0, pitch: 60, dur: 240 },
    { tick: 0, ch: 1, pitch: 64, dur: 240 },
    { tick: 240, ch: 0, pitch: 67, dur: 240 },
    { tick: 240, ch: 2, pitch: 48, dur: 480 },
  ];
  for (const n of notes) {
    events.push({ tick: n.tick, data: [0x90 | n.ch, n.pitch, 100] });
    events.push({ tick: n.tick + n.dur, data: [0x80 | n.ch, n.pitch, 0] });
  }
  events.push({ tick: 1000, data: [0xff, 0x2f, 0x00] });
  events.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0]);

  const track = [];
  let prev = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - prev));
    track.push(...e.data);
    prev = e.tick;
  }

  const header = Buffer.alloc(14);
  header.write('MThd', 0);
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(0, 8); // format 0
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(ppq, 12);

  const th = Buffer.alloc(8);
  th.write('MTrk', 0);
  th.writeUInt32BE(track.length, 4);
  return Buffer.concat([header, th, Buffer.from(track)]);
}

writeFileSync(join(outDir, 'f09-format0.mid'), buildFormat0());
console.log('wrote', join(outDir, 'f09-format0.mid'));
