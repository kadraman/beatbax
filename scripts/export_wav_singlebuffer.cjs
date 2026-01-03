#!/usr/bin/env node
const fs = require('fs');
(async ()=>{
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node export_wav_singlebuffer.cjs <song.bax> [out.wav]');
    process.exit(2);
  }
  const file = args[0];
  const out = args[1] || file.replace(/\.[^/.]+$/, '') + '_singlebuffer.wav';
  const { parse } = require('../packages/engine/dist/parser/index.js');
  const { resolveSong } = require('../packages/engine/dist/song/resolver.js');
  const { exportWAVFromSong } = require('../packages/engine/dist/export/wavWriter.js');
  const src = fs.readFileSync(file, 'utf8');
  const ast = parse(src);
  const song = resolveSong(ast);
  await exportWAVFromSong(song, out, { sampleRate: 44100, bitDepth: 16 }, { debug: true });
  console.log('Exported single-buffer WAV:', out);
})();
