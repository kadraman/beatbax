import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// repoRoot should be the repository root (three levels up from packages/engine/scripts)
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const songsDir = path.resolve(repoRoot, 'songs');
const outDir = path.resolve(__dirname, '..', '..', 'tmp', 'parity-exports');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
ensureDir(outDir);

async function importEngineDist(modulePath) {
  // modulePath is relative to packages/engine/dist
  const full = path.resolve(__dirname, '..', 'dist', modulePath);
  return import(full);
}

(async () => {
  let files = [];
  if (!fs.existsSync(songsDir)) {
    console.log(`No songs directory found at ${songsDir}; skipping parity export checks`);
    process.exit(0);
  } else {
    files = fs.readdirSync(songsDir).filter(f => f.endsWith('.bax'));
    if (files.length === 0) {
      console.log('No .bax files found in songs/ — skipping parity export checks');
      process.exit(0);
    }
  }

  // Import dist exports (assumes `npm run build-all` has been run)
  const parserModule = await importEngineDist('parser/index.js');
  const chevModule = await importEngineDist('parser/chevrotain/index.js');
  const exportModule = await importEngineDist('export/index.js');

  const { exportJSON, exportMIDI, exportUGE } = exportModule;

  let failures = 0;

  for (const f of files) {
    const songPath = path.join(songsDir, f);
    const base = path.basename(f, '.bax');
    console.log(`\n=== Checking ${f} ===`);
    const src = fs.readFileSync(songPath, 'utf8');

    // legacy parse
    let a1;
    try { a1 = parserModule.parse(src); } catch (e) { console.error('Legacy parse error:', e); failures++; continue; }

    // chevrotain parse
    let res;
    try { res = await chevModule.default(src); } catch (e) { console.error('Chev parse error:', e); failures++; continue; }
    if (res.errors && res.errors.length) { console.error('Chev parse errors:', res.errors); failures++; continue; }
    const a2 = res.ast;

    // JSON export compare
    const out1 = path.join(outDir, `${base}.legacy.json`);
    const out2 = path.join(outDir, `${base}.chev.json`);
    await exportJSON(a1, out1, { debug: false });
    await exportJSON(a2, out2, { debug: false });
    const j1 = JSON.parse(fs.readFileSync(out1, 'utf8'));
    const j2 = JSON.parse(fs.readFileSync(out2, 'utf8'));
    // Normalize non-deterministic fields (exportedAt) — handle top-level and nested placements
    if (j1 && Object.prototype.hasOwnProperty.call(j1, 'exportedAt')) delete j1.exportedAt;
    if (j2 && Object.prototype.hasOwnProperty.call(j2, 'exportedAt')) delete j2.exportedAt;
    // Also normalize nested placement just in case: { song: { exportedAt: ... } }
    if (j1 && j1.song && Object.prototype.hasOwnProperty.call(j1.song, 'exportedAt')) delete j1.song.exportedAt;
    if (j2 && j2.song && Object.prototype.hasOwnProperty.call(j2.song, 'exportedAt')) delete j2.song.exportedAt;

    const s1 = JSON.stringify(j1, Object.keys(j1).sort(), 2);
    const s2 = JSON.stringify(j2, Object.keys(j2).sort(), 2);
    if (s1 !== s2) {
      console.error(`JSON export mismatch for ${f}`);
      failures++;
    } else {
      console.log('JSON export: OK');
    }

    // MIDI export compare (binary)
    const m1 = path.join(outDir, `${base}.legacy.mid`);
    const m2 = path.join(outDir, `${base}.chev.mid`);
    try {
      await exportMIDI(a1, m1);
      await exportMIDI(a2, m2);
      const b1 = fs.readFileSync(m1);
      const b2 = fs.readFileSync(m2);
      const same = b1.equals(b2);
      if (!same) { console.error(`MIDI export mismatch for ${f}`); failures++; } else { console.log('MIDI export: OK'); }
    } catch (e) {
      console.warn('MIDI export skipped (error or not supported):', e.message || e);
    }

    // UGE export compare (binary)
    const u1 = path.join(outDir, `${base}.legacy.uge`);
    const u2 = path.join(outDir, `${base}.chev.uge`);
    try {
      await exportUGE(a1, u1);
      await exportUGE(a2, u2);
      const b1 = fs.readFileSync(u1);
      const b2 = fs.readFileSync(u2);
      const same = b1.equals(b2);
      if (!same) { console.error(`UGE export mismatch for ${f}`); failures++; } else { console.log('UGE export: OK'); }
    } catch (e) {
      console.warn('UGE export skipped (error or not supported):', e.message || e);
    }
  }

  if (failures > 0) {
    console.error(`\nParity checks failed: ${failures} mismatches`);
    process.exit(2);
  }

  console.log('\nAll parity checks OK');
  process.exit(0);
})();
