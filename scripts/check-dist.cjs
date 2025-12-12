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
  const root = path.resolve(__dirname, '..');
  const packagesDir = path.join(root, 'packages');

  const packagesToCheck = [
    { name: 'engine', pkgPath: path.join(packagesDir, 'engine') },
    { name: 'cli', pkgPath: path.join(packagesDir, 'cli') }
  ];

  let ok = true;

  for (const p of packagesToCheck) {
    const dist = path.join(p.pkgPath, 'dist');
    const src = path.join(p.pkgPath, 'src');

    if (!fs.existsSync(p.pkgPath)) {
      console.error(`Package directory not found: ${p.pkgPath}`);
      ok = false;
      continue;
    }

    if (!fs.existsSync(dist)) {
      console.error(`Error: ${path.relative(process.cwd(), dist)} not found. Did package build run?`);
      ok = false;
      continue;
    }

    // Copy any source .d.ts files (hand-authored) into dist so consumers get them
    copyDtsFiles(src, dist);

    // Minimal required files per package
    const required = [];
    if (p.name === 'engine') {
      required.push(path.join(dist, 'index.d.ts'));
      required.push(path.join(dist, 'index.js'));
      required.push(path.join(dist, 'scheduler', 'index.js'));
      required.push(path.join(dist, 'scheduler', 'index.d.ts'));
    } else if (p.name === 'cli') {
      required.push(path.join(dist, 'cli.js'));
      required.push(path.join(dist, 'index.js'));
    }

    for (const r of required) {
      if (!fs.existsSync(r)) {
        console.error('Missing required build output:', path.relative(process.cwd(), r));
        ok = false;
      }
    }

    // Print a short dist tree for this package
    function list(dir, prefix = '') {
      const names = fs.readdirSync(dir);
      for (const n of names) {
        const pth = path.join(dir, n);
        const stat = fs.statSync(pth);
        if (stat.isDirectory()) {
          console.log(prefix + n + '/');
          list(pth, prefix + '  ');
        } else {
          console.log(prefix + n);
        }
      }
    }

    console.log(`${p.name} dist/ contents:`);
    list(dist);
  }

  if (!ok) process.exit(3);

  console.log('Build outputs verified for packages.');
}

verify();
