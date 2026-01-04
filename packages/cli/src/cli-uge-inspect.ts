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
  // Helper copied here to normalize error extraction without adding a new module
  const extractErrorMessage = (e: any, preferStack = false): string => {
    if (!e) return String(e);
    if (preferStack && e && (e as any).stack) return String((e as any).stack);
    if (e && (e as any).message) return String((e as any).message);
    try { return String(e); } catch { return '[unserializable error]'; }
  };

  console.error('Failed to inspect file:', extractErrorMessage(err, false));
  process.exit(2);
}
