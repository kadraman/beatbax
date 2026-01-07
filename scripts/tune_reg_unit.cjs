const fs = require('fs');
const child = require('child_process');
const path = require('path');

const FILE = path.resolve(__dirname, '../packages/engine/src/audio/pcmRenderer.ts');
const SONG = 'songs/effect_demo.bax';
const OUT = 'songs/beatbax-browser-export.wav';
const REF = 'songs/hugetracker-export.wav';

function setUnit(v) {
  const src = fs.readFileSync(FILE,'utf8');
  const updated = src.replace(/const RENDER_REG_PER_TRACKER_UNIT = [0-9]+;/, `const RENDER_REG_PER_TRACKER_UNIT = ${v};`);
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
  const candidates = [1,2,4,6,8,10,12,14,16,18,20,24,28,32];
  let best = null;
  for (const c of candidates) {
    console.log('Testing unit', c);
    setUnit(c);
    try {
      runExport();
      const res = compare();
      if (!res) { console.log('Compare failed'); continue; }
      const err = Math.abs(res.a.depthCents - res.b.depthCents);
      console.log('Unit', c, 'depthA', res.a.depthCents.toFixed(2), 'depthB', res.b.depthCents.toFixed(2), 'err', err.toFixed(2));
      if (!best || err < best.err) best = { unit: c, err, res };
    } catch (e) {
      console.error('Error for unit', c, e.message);
    }
  }
  if (best) {
    console.log('Best unit', best.unit, 'err', best.err);
    setUnit(best.unit);
    console.log('Best result A:', best.res.a);
    console.log('Best result B:', best.res.b);
  } else {
    console.log('No best found');
  }
})();
