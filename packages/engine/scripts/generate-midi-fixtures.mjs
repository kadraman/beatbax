/**
 * Generate synthetic MIDI fixtures F04–F09 (feature 006) and F10–F14 (feature 089).
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

// --- Feature 089 fixtures (PPQ 480: beat = 480, 16th = 120, 4/4 bar = 1920) ---
const BEAT = 480;
const BAR = 1920;

function track(midi, { name, channel, program }) {
  const t = midi.addTrack();
  t.name = name;
  t.channel = channel;
  if (program != null) t.instrument.number = program;
  return t;
}

// F10 — bar-range lanes + gap fill: synth riff (bars 1–2) and vocal (bars 3–4) share
// pulse1; guitar offbeats fill the gaps; one synth note crosses its toBar boundary.
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const vocal = track(midi, { name: 'Vocal', channel: 0, program: 52 });
  const synth = track(midi, { name: 'Synth Riff', channel: 1, program: 81 });
  const guitar = track(midi, { name: 'Guitar', channel: 2, program: 27 });
  const bass = track(midi, { name: 'Bass', channel: 3, program: 33 });
  const strings = track(midi, { name: 'Strings', channel: 4, program: 48 });
  for (let i = 0; i < 16; i++) {
    vocal.addNote({ midi: 72 + (i % 4) * 2, ticks: i * BEAT, durationTicks: BEAT });
    synth.addNote({ midi: 79, ticks: i * BEAT, durationTicks: i === 7 ? 3 * 240 : 240 });
    guitar.addNote({ midi: 64, ticks: i * BEAT + 240, durationTicks: 240 });
  }
  for (let bar = 0; bar < 4; bar++) {
    bass.addNote({ midi: 40, ticks: bar * BAR, durationTicks: BAR });
    strings.addNote({ midi: 60, ticks: bar * BAR, durationTicks: BAR });
  }
  write('f10-lanes.mid', midi);
}

// F11 — mono policies: chord lead (highest + legato tail), chord bass (lowest),
// overlapping sequencer line (newest, transposed up an octave).
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const lead = track(midi, { name: 'Chord Lead', channel: 0, program: 81 });
  const bass = track(midi, { name: 'Chord Bass', channel: 1, program: 33 });
  const seq = track(midi, { name: 'Seq', channel: 2, program: 80 });
  for (let i = 0; i < 4; i++) {
    for (const p of [60, 64, 67]) lead.addNote({ midi: p, ticks: i * BEAT, durationTicks: BEAT });
    for (const p of [36, 43]) bass.addNote({ midi: p, ticks: i * BEAT, durationTicks: BEAT });
  }
  lead.addNote({ midi: 72, ticks: BAR, durationTicks: BAR });
  lead.addNote({ midi: 69, ticks: BAR + BEAT, durationTicks: 240 });
  lead.addNote({ midi: 65, ticks: BAR + 3 * BEAT, durationTicks: BEAT });
  seq.addNote({ midi: 60, ticks: BAR, durationTicks: 960 });
  seq.addNote({ midi: 62, ticks: BAR + 240, durationTicks: 960 });
  seq.addNote({ midi: 64, ticks: BAR + 480, durationTicks: 960 });
  write('f11-mono.mid', midi);
}

// F12 — tempo map + window + nudge: a 200 BPM count-in bar, then 96 BPM; the song
// grid is one sixteenth late; bar 5 is an outro trimmed by endBar.
{
  const midi = new Midi();
  midi.header.tempos = [
    { ticks: 0, bpm: 200 },
    { ticks: BAR, bpm: 96 },
  ];
  midi.header.update();
  const click = track(midi, { name: 'Count-in', channel: 0, program: 115 });
  const lead = track(midi, { name: 'Lead', channel: 1, program: 81 });
  for (let i = 0; i < 4; i++) click.addNote({ midi: 84, ticks: i * BEAT, durationTicks: 120 });
  for (let i = 0; i < 16; i++) {
    lead.addNote({ midi: 60 + (i % 5), ticks: BAR + i * BEAT + 120, durationTicks: 240 });
  }
  write('f12-tempo-window.mid', midi);
}

// F13 — triplet-eighth grid at 135 BPM (import with ticksPerBeat 3).
{
  const midi = new Midi();
  midi.header.setTempo(135);
  const lead = track(midi, { name: 'Triplet Lead', channel: 0, program: 81 });
  const TRIPLET_EIGHTH = BEAT / 3;
  for (let i = 0; i < 24; i++) {
    lead.addNote({ midi: [67, 64, 60][i % 3], ticks: i * TRIPLET_EIGHTH, durationTicks: TRIPLET_EIGHTH });
  }
  write('f13-triplet.mid', midi);
}

// F14 — duplicate track, sound-effect track, and a drum kit with a non-GM note (87).
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const lead = track(midi, { name: 'Lead', channel: 0, program: 81 });
  const copy = track(midi, { name: 'Lead Copy', channel: 1, program: 81 });
  const sfx = track(midi, { name: 'SFX', channel: 2, program: 122 });
  const drums = track(midi, { name: 'Drums', channel: 9 });
  for (let i = 0; i < 8; i++) {
    const note = { midi: 72 + (i % 3), ticks: i * BEAT, durationTicks: 240 };
    lead.addNote(note);
    copy.addNote(note);
    drums.addNote({ midi: i % 2 === 0 ? 36 : 38, ticks: i * BEAT, durationTicks: 120 });
    drums.addNote({ midi: 87, ticks: i * BEAT + 240, durationTicks: 120 });
  }
  sfx.addNote({ midi: 90, ticks: 0, durationTicks: BAR });
  sfx.addNote({ midi: 90, ticks: BAR, durationTicks: BAR });
  write('f14-dup-unmapped.mid', midi);
}
