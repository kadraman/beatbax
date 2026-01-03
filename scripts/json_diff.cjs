const fs = require('fs');
const aPath = process.argv[2];
const bPath = process.argv[3];
if (!aPath || !bPath) { console.error('Usage: node json_diff.cjs a.json b.json'); process.exit(2); }
const a = JSON.parse(fs.readFileSync(aPath,'utf8'));
const b = JSON.parse(fs.readFileSync(bPath,'utf8'));
function strip(obj) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) return obj.map(strip);
    const out = {};
    for (const k of Object.keys(obj)) {
      if (k === 'exportedAt' || k === 'generatedAt' || k === 'timestamp') continue;
      out[k] = strip(obj[k]);
    }
    return out;
  }
  return obj;
}
const A = strip(a);
const B = strip(b);
const diffs = [];
function compare(x,y,path) {
  if (typeof x !== typeof y) { diffs.push({path, a:x, b:y}); return; }
  if (x && typeof x === 'object') {
    if (Array.isArray(x) !== Array.isArray(y)) { diffs.push({path,a:x,b:y}); return; }
    if (Array.isArray(x)) {
      const L = Math.max(x.length, y.length);
      for (let i=0;i<L;i++) compare(x[i], y[i], path + '['+i+']');
      return;
    }
    const keys = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
    for (const k of keys) compare(x ? x[k] : undefined, y ? y[k] : undefined, path ? path + '.' + k : k);
    return;
  }
  if (x !== y) diffs.push({path, a:x, b:y});
}
compare(A,B,'');
console.log('Differences found:', diffs.length);
for (let i=0;i<Math.min(diffs.length,200);i++) {
  const d = diffs[i];
  console.log(d.path, JSON.stringify(d.a), '=>', JSON.stringify(d.b));
}
process.exit(diffs.length>0?0:0);
