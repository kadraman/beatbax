const fs = require('fs');
const path = require('path');

function copyDtsFiles(srcDir, outDir) {
  if (!fs.existsSync(srcDir)) return;
  const items = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const it of items) {
    const srcPath = path.join(srcDir, it.name);
    const outPath = path.join(outDir, it.name);
    if (it.isDirectory()) {
      copyDtsFiles(srcPath, outPath);
    } else if (it.isFile() && srcPath.endsWith('.d.ts')) {
      // ensure out dir exists
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      try {
        fs.copyFileSync(srcPath, outPath);
        console.log('Copied', srcPath, '->', outPath);
      } catch (e) {
        console.error('Failed to copy', srcPath, e);
      }
    }
  }
}

function verify() {
  const dist = path.resolve(__dirname, '..', 'dist');
  const src = path.resolve(__dirname, '..', 'src');
  if (!fs.existsSync(dist)) {
    console.error('Error: dist/ directory not found. Did tsc run?');
    process.exit(2);
  }

  // Copy any source .d.ts files (hand-authored) into dist so consumers get them
  copyDtsFiles(src, dist);

  const required = [
    path.join(dist, 'index.d.ts'),
    path.join(dist, 'index.js'),
    path.join(dist, 'scheduler', 'index.js'),
    path.join(dist, 'scheduler', 'index.d.ts')
  ];

  let ok = true;
  for (const r of required) {
    if (!fs.existsSync(r)) {
      console.error('Missing required build output:', path.relative(process.cwd(), r));
      ok = false;
    }
  }

  if (!ok) process.exit(3);

  // Print a short dist tree
  function list(dir, prefix = '') {
    const names = fs.readdirSync(dir);
    for (const n of names) {
      const p = path.join(dir, n);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        console.log(prefix + n + '/');
        list(p, prefix + '  ');
      } else {
        console.log(prefix + n);
      }
    }
  }

  console.log('dist/ contents:');
  list(dist);
  console.log('Build outputs verified.');
}

verify();
