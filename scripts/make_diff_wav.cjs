const fs = require('fs');

if (process.argv.length < 5) {
  console.error('Usage: node make_diff_wav.cjs <new.wav> <orig.wav> <out_diff.wav>');
  process.exit(2);
}

const [ , , newPath, origPath, outPath ] = process.argv;

const newBuf = fs.readFileSync(newPath);
const origBuf = fs.readFileSync(origPath);

if (newBuf.length < 44 || origBuf.length < 44) {
  console.error('One of the files is too small to be a valid WAV');
  process.exit(3);
}

const headerNew = newBuf.slice(0,44);

const dataNew = newBuf.slice(44);
const dataOrig = origBuf.slice(44);

const len = Math.min(dataNew.length, dataOrig.length);
if (dataNew.length !== dataOrig.length) {
  console.warn('Warning: data chunk lengths differ — using min length', dataNew.length, dataOrig.length);
}

const outData = Buffer.alloc(len);

let maxAbs = 0;
let sumAbs = 0;
let sumSq = 0;
let equalCount = 0;
let total = Math.floor(len / 2);

for (let i = 0; i < total; i++) {
  const s1 = dataNew.readInt16LE(i*2);
  const s2 = dataOrig.readInt16LE(i*2);
  const d = s1 - s2;
  if (d === 0) equalCount++;
  const absd = Math.abs(d);
  maxAbs = Math.max(maxAbs, absd);
  sumAbs += absd;
  sumSq += d*d;
  // clamp
  const cd = Math.max(-32768, Math.min(32767, d));
  outData.writeInt16LE(cd, i*2);
}

// Build output WAV: copy header from new file but set data sizes to len
const outHeader = Buffer.from(headerNew);
// update ChunkSize (4 bytes at offset 4): 36 + Subchunk2Size
const subchunk2Size = len;
const chunkSize = 36 + subchunk2Size;
outHeader.writeUInt32LE(chunkSize, 4);
// update Subchunk2Size at offset 40
outHeader.writeUInt32LE(subchunk2Size, 40);

fs.writeFileSync(outPath, Buffer.concat([outHeader, outData]));

const meanAbs = sumAbs / total;
const rms = Math.sqrt(sumSq / total);
const pctIdentical = (equalCount / total) * 100;

console.log('Wrote diff WAV:', outPath);
console.log('Samples:', total);
console.log('Max abs diff:', maxAbs);
console.log('Mean abs diff:', meanAbs.toFixed(3));
console.log('RMS diff:', rms.toFixed(3));
console.log('Percent identical:', pctIdentical.toFixed(6) + '%');
process.exit(0);
