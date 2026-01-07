import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import child_process from 'child_process';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scripts/auto_calibrate_vib_dense.mjs <huge-ref.wav> [song.bax] [outDir]');
  process.exit(2);
}
const refWav = args[0];
const songPath = args[1] || 'songs/effect_demo.bax';
const outDir = args[2] || 'tmp/auto_dense';
const sampleRate = 44100;

if (!existsSync(refWav)) {
  console.error('Reference WAV not found:', refWav);
  process.exit(3);
}
if (!existsSync(songPath)) {
  console.error('Song file not found:', songPath);
  process.exit(4);
}
try { mkdirSync(outDir, { recursive: true }); } catch (e) {}

console.log('Loading engine modules...');
const { parse } = await import('../packages/engine/src/parser/index.ts');
const { resolveSong } = await import('../packages/engine/src/song/resolver.ts');
const { renderSongToPCM } = await import('../packages/engine/src/audio/pcmRenderer.ts');
const { exportWAV } = await import('../packages/engine/src/export/wavWriter.ts');

const src = await (await import('fs')).promises.readFile(songPath, 'utf8');
const ast = parse(src);
const song = resolveSong(ast);

// Denser parameter grid around previous best (vibDepthScale=4, regBaseFactor=0.04)
const vibDepthScales = [3.5, 3.75, 4.0, 4.25, 4.5];
const regBaseFactors = [0.03, 0.035, 0.04, 0.045, 0.05];
const regUnits = [1];

let best = { diff: Infinity, params: null };
const results = [];
let run = 0;
for (const vibDepthScale of vibDepthScales) {
  for (const regBaseFactor of regBaseFactors) {
    for (const regUnit of regUnits) {
      run++;
      const name = `vds${vibDepthScale}_rbf${regBaseFactor}_ru${regUnit}`.replace(/\./g,'p');
      const outPath = path.join(outDir, `${name}.wav`);
      console.log(`Run ${run}: vibDepthScale=${vibDepthScale} regBaseFactor=${regBaseFactor} regUnit=${regUnit}`);
      const samples = renderSongToPCM(song, {
        sampleRate,
        channels: 2,
        duration: 5,
        vibDepthScale,
        regPerTrackerBaseFactor: regBaseFactor,
        regPerTrackerUnit: regUnit
      });
      await exportWAV(samples, outPath, { sampleRate, bitDepth: 16, channels: 2 });

      // Call compare script: node scripts/compare_vib.cjs <beatbax.wav> <huge.wav>
      try {
        const stdout = child_process.execSync(`node "${path.join('scripts','compare_vib.cjs')}" "${outPath}" "${refWav}"`, { encoding: 'utf8' });
        const m = [...stdout.matchAll(/depthCents:\s*([0-9.+-eE]+)/g)];
        if (m.length >= 2) {
          const aDepth = parseFloat(m[0][1]);
          const bDepth = parseFloat(m[1][1]);
          const diff = Math.abs(aDepth - bDepth);
          console.log(`  measured depth: ${aDepth.toFixed(2)} (ref ${bDepth.toFixed(2)}) diff=${diff.toFixed(2)}`);
          results.push({ vibDepthScale, regBaseFactor, regUnit, aDepth, bDepth, diff, outPath });
          if (diff < best.diff) best = { diff, params: { vibDepthScale, regBaseFactor, regUnit, outPath, aDepth, bDepth } };
        } else {
          console.warn('  compare_vib did not produce depthCents output for run', name);
        }
      } catch (e) {
        console.error('  compare_vib failed:', e.message || e);
      }
    }
  }
}

console.log('\nDense sweep complete. Best match:');
console.log(best);
const csv = ['vibDepthScale,regBaseFactor,regUnit,aDepth,bDepth,diff,outPath'];
for (const r of results) csv.push([r.vibDepthScale, r.regBaseFactor, r.regUnit, r.aDepth, r.bDepth, r.diff, r.outPath].join(','));
await (await import('fs')).promises.writeFile(path.join(outDir,'results.csv'), csv.join('\n'), 'utf8');
console.log('Results written to', path.join(outDir,'results.csv'));
process.exit(0);
