const fs = require('fs');
function readWav(p){
  const b = fs.readFileSync(p);
  if (b.toString('ascii',0,4) !== 'RIFF') throw new Error('Not RIFF');
  const fmtIdx = b.indexOf(Buffer.from('fmt '));
  const fmtChunkSize = b.readUInt32LE(fmtIdx+4);
  const audioFormat = b.readUInt16LE(fmtIdx+8);
  const numChannels = b.readUInt16LE(fmtIdx+10);
  const sampleRate = b.readUInt32LE(fmtIdx+12);
  const byteRate = b.readUInt32LE(fmtIdx+16);
  const blockAlign = b.readUInt16LE(fmtIdx+20);
  const bitsPerSample = b.readUInt16LE(fmtIdx+22);
  const dataIdx = b.indexOf(Buffer.from('data'));
  const dataSize = b.readUInt32LE(dataIdx+4);
  const dataStart = dataIdx+8;
  const samples = [];
  if (bitsPerSample !== 16) throw new Error('Only 16-bit PCM supported in this script');
  for (let i = dataStart; i < dataStart + dataSize; i += 2*numChannels){
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++){
      const off = i + ch*2;
      const v = b.readInt16LE(off);
      sum += v;
    }
    samples.push(sum / numChannels);
  }
  return { sampleRate, bitsPerSample, numChannels, samples, duration: samples.length / sampleRate };
}

function fft(re, im){
  const n = re.length;
  let j = 0;
  for (let i=1;i<n-1;i++){
    let bit = n>>1;
    for (; j & bit; bit >>=1) j ^= bit;
    j ^= bit;
    if (i < j){ let tr = re[i]; re[i]=re[j]; re[j]=tr; let ti = im[i]; im[i]=im[j]; im[j]=ti; }
  }
  for (let len=2; len<=n; len<<=1){
    const ang = -2*Math.PI/len;
    const wlen_r = Math.cos(ang), wlen_i = Math.sin(ang);
    for (let i=0;i<n;i+=len){
      let wr = 1, wi = 0;
      for (let j=0;j<len/2;j++){
        const u_r = re[i+j], u_i = im[i+j];
        const v_r = re[i+j+len/2]*wr - im[i+j+len/2]*wi;
        const v_i = re[i+j+len/2]*wi + im[i+j+len/2]*wr;
        re[i+j] = u_r + v_r; im[i+j] = u_i + v_i;
        re[i+j+len/2] = u_r - v_r; im[i+j+len/2] = u_i - v_i;
        const nw = wr*wlen_r - wi*wlen_i;
        wi = wr*wlen_i + wi*wlen_r;
        wr = nw;
      }
    }
  }
}

function hamming(N,i){ return 0.54 - 0.46*Math.cos(2*Math.PI*i/(N-1)); }

function analyze(path){
  const w = readWav(path);
  const sr = w.sampleRate;
  const samples = w.samples.map(s=>s/32768);
  const win = 4096;
  const hop = 512;
  const frames = [];
  for (let start=0; start+win <= samples.length; start += hop){
    const re = new Array(win).fill(0);
    const im = new Array(win).fill(0);
    for (let i=0;i<win;i++) re[i] = samples[start+i]*hamming(win,i);
    fft(re,im);
    const mags = new Array(win/2);
    for (let k=0;k<win/2;k++) mags[k] = Math.sqrt(re[k]*re[k]+im[k]*im[k]);
    let peak = 0; let peakMag = 0;
    for (let k=1;k<mags.length;k++){
      if (mags[k] > peakMag){ peakMag = mags[k]; peak = k; }
    }
    const freq = peak * sr / win;
    frames.push({ time: start/sr, freq, peakMag });
  }
  const freqs = frames.map(f=>f.freq);
  const mags = frames.map(f=>f.peakMag);
  const maxMag = Math.max(...mags);
  const valid = frames.map((f,idx)=> (mags[idx] > maxMag*0.05) ? freqs[idx] : NaN);
  for (let i=0;i<valid.length;i++){
    if (isNaN(valid[i])){
      let l=i-1; while(l>=0 && isNaN(valid[l])) l--;
      let r=i+1; while(r<valid.length && isNaN(valid[r])) r++;
      if (l>=0 && r<valid.length) valid[i] = (valid[l]+valid[r])/2;
      else if (l>=0) valid[i]=valid[l];
      else if (r<valid.length) valid[i]=valid[r];
      else valid[i]=0;
    }
  }
  const mean = valid.reduce((a,b)=>a+b,0)/valid.length;
  const detr = valid.map(v=>v-mean);
  const maxLag = Math.min(200, Math.floor(detr.length/2));
  const ac = new Array(maxLag).fill(0);
  for (let lag=1; lag<maxLag; lag++){
    let s=0; for (let i=0;i+lag<detr.length;i++) s += detr[i]*detr[i+lag]; ac[lag]=s;
  }
  let bestLag=1; let bestVal=ac[1];
  for (let l=2;l<maxLag;l++) if (ac[l]>bestVal){ bestVal=ac[l]; bestLag=l; }
  const frameRate = sr / hop;
  const vibRateHz = frameRate / bestLag;
  const devs = detr.filter(v=>!isNaN(v));
  const std = Math.sqrt(devs.reduce((a,b)=>a+b*b,0)/devs.length);
  const depthCents = 1200*Math.log2((mean+std)/mean || 1);
  return { path, sampleRate: sr, duration: w.duration, frames: frames.length, estimatedFundamentalHz: mean, vibRateHz, depthCents };
}

if (process.argv.length < 4) { console.log('Usage: node compare_vib.cjs <beatbax.wav> <huge.wav>'); process.exit(2); }
const a = analyze(process.argv[2]);
const b = analyze(process.argv[3]);
console.log('RESULT A:', a);
console.log('RESULT B:', b);
const rateRatio = b.vibRateHz / a.vibRateHz;
console.log('VIB RATE RATIO (huge / beatbax):', rateRatio.toFixed(2));
