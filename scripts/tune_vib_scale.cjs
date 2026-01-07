const fs = require('fs');
const child = require('child_process');
const path = require('path');

const FILE = path.resolve(__dirname, '../packages/engine/src/audio/pcmRenderer.ts');
const SONG = 'songs/effect_demo.bax';
const OUT = 'songs/beatbax-browser-export.wav';
const REF = 'songs/hugetracker-export.wav';

function setScale(v) {
  const src = fs.readFileSync(FILE,'utf8');
  const updated = src.replace(/const VIB_DEPTH_RENDER_SCALE = [0-9\.]+;/, `const VIB_DEPTH_RENDER_SCALE = ${v};`);
  fs.writeFileSync(FILE, updated, 'utf8');
}

function runExport() {
  child.execSync(`node bin/beatbax export wav ${SONG} ${OUT} --debug`, { stdio: ['ignore','pipe','pipe'] });
}

function compare() {
  const out = child.execSync(`node scripts/compare_vib.cjs ${OUT} ${REF}`, { encoding: 'utf8' });
  const mA = out.match(/RESULT A:\s*([\s\S]*?)\nRESULT B:/);
  const mB = out.match(/RESULT B:\s*([\s\S]*?)\nVIB RATE/);
  if (!mA || !mB) return null;
  const a = eval('(' + mA[1] + ')');
  const b = eval('(' + mB[1] + ')');
  return { a, b };
}

(async function(){
  const candidates = [0.1,0.25,0.5,0.75,1.0,1.5,2.0,3.0,4.0];
  let best = null;
  for (const c of candidates) {
    console.log('Testing scale', c);
    setScale(c);
    try {
      runExport();
      const res = compare();
      if (!res) { console.log('Compare failed'); continue; }
      const err = Math.abs(res.a.depthCents - res.b.depthCents);
      console.log('Scale', c, 'depthA', res.a.depthCents.toFixed(2), 'depthB', res.b.depthCents.toFixed(2), 'err', err.toFixed(2));
      if (!best || err < best.err) best = { scale: c, err, res };
    } catch (e) {
      console.error('Error for scale', c, e.message);
    }
  }
  if (best) {
    console.log('Best scale', best.scale, 'err', best.err);
    setScale(best.scale);
    console.log('Best result A:', best.res.a);
    console.log('Best result B:', best.res.b);
  } else {
    console.log('No best found');
  }
})();
