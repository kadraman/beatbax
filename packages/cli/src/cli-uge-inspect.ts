import { readFileSync } from 'fs';
import { parse } from '@beatbax/engine/parser';

const file = process.argv[2];
if (!file) {
  console.error('Usage: cli-uge-inspect <file>');
  process.exit(2);
}

try {
  const src = readFileSync(file, 'utf8');
  const ast = parse(src);
  console.log(JSON.stringify(ast, null, 2));
} catch (err: any) {
  console.error('Failed to inspect file:', err && err.message ? err.message : err);
  process.exit(2);
}
