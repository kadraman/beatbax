const fs = require('fs');
const [,, f1, f2, wArg] = process.argv;
const window = Number(wArg || 16);
if (!f1 || !f2) {
  console.error('Usage: node peek_diff_window.cjs <fileA.wav> <fileB.wav> [window]');
  process.exit(2);
}
function findChunk(buf, tag) {
  const t = Buffer.from(tag);
  for (let i = 12; i < buf.length - 8; i++) {
    if (buf[i] === t[0] && buf[i+1] === t[1] && buf[i+2] === t[2] && buf[i+3] === t[3]) return i;
  }
  return -1;
}
function parseWav(buf) {
  if (buf.toString('ascii',0,4) !== 'RIFF' || buf.toString('ascii',8,12) !== 'WAVE') throw new Error('Not a WAV');
  const fmtIdx = findChunk(buf, 'fmt ');
  if (fmtIdx < 0) throw new Error('fmt chunk not found');
  const fmtSize = buf.readUInt32LE(fmtIdx+4);
  const audioFormat = buf.readUInt16LE(fmtIdx+8);
  const numChannels = buf.readUInt16LE(fmtIdx+10);
  const sampleRate = buf.readUInt32LE(fmtIdx+12);
  const bitsPerSample = buf.readUInt16LE(fmtIdx+22);
  const dataIdx = findChunk(buf, 'data');
  if (dataIdx < 0) throw new Error('data chunk not found');
  const dataSize = buf.readUInt32LE(dataIdx+4);
  const dataOffset = dataIdx + 8;
  return { audioFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataSize };
}
function readFrame(buf, frameIndex, info) {
  const bytesPerSample = info.bitsPerSample/8;
  const blockAlign = info.numChannels * bytesPerSample;
  const off = info.dataOffset + frameIndex * blockAlign;
  const ch = [];
  for (let c=0;c<info.numChannels;c++){
    const sampleOff = off + c*bytesPerSample;
    if (bytesPerSample === 2) ch.push(buf.readInt16LE(sampleOff));
    else if (bytesPerSample === 1) ch.push(buf.readUInt8(sampleOff)-128);
    else throw new Error('Unsupported sample width: '+bytesPerSample);
  }
  return ch;
}
const A = fs.readFileSync(f1);
const B = fs.readFileSync(f2);
const infoA = parseWav(A);
const infoB = parseWav(B);
if (infoA.numChannels !== infoB.numChannels || infoA.bitsPerSample !== infoB.bitsPerSample) {
  console.error('WAV formats differ'); process.exit(3);
}
const frames = Math.min(infoA.dataSize / (infoA.numChannels * (infoA.bitsPerSample/8)), infoB.dataSize / (infoB.numChannels * (infoB.bitsPerSample/8)));
let firstDiff = -1;
for (let i=0;i<frames;i++){
  const ra = readFrame(A, i, infoA);
  const rb = readFrame(B, i, infoB);
  let any=false;
  for (let c=0;c<ra.length;c++) if (ra[c] !== rb[c]) { any=true; break; }
  if (any) { firstDiff = i; break; }
}
if (firstDiff < 0) { console.log('Files are identical (no frame differences)'); process.exit(0); }
const start = Math.max(0, firstDiff - window);
const end = Math.min(frames-1, firstDiff + window);
console.log('First differing frame:', firstDiff, 'window:', start, '-', end);
console.log('frame\tchan\tfileA\tfileB\tdiff');
for (let i=start;i<=end;i++){
  const ra = readFrame(A, i, infoA);
  const rb = readFrame(B, i, infoB);
  for (let c=0;c<ra.length;c++){
    console.log(i, '\t'+c, '\t'+ra[c], '\t'+rb[c], '\t'+(ra[c]-rb[c]));
  }
}
