const fs = require('fs');
const a = fs.readFileSync(process.argv[2]);
const b = fs.readFileSync(process.argv[3]);
const da = a.slice(44);
const db = b.slice(44);
const n = Math.min(32, Math.floor(Math.min(da.length, db.length)/2));
for (let i=0;i<n;i++){
  const sa = da.readInt16LE(i*2);
  const sb = db.readInt16LE(i*2);
  console.log(i, sa, sb, sa-sb);
}
