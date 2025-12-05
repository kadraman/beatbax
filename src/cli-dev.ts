// Debug bootstrap used to surface ts-node/esm loader errors clearly.
// This file is intentionally minimal — it dynamically imports the
// TypeScript CLI entry and prints a detailed inspection of any thrown
// object so debugging loader or runtime issues is easier.
import util from 'node:util';

(async () => {
  try {
    // Import the CLI entry. Use extensionless import to match source style.
    await import('./cli');
  } catch (err: any) {
    console.error('Error loading CLI (debug):');
    try {
      // Attempt to print the thrown object with full depth
      console.error(util.inspect(err, { depth: null, colors: true }));
    } catch (_) {
      console.error(String(err));
    }
    if (err && err.stack) console.error('\nStack:\n', err.stack);
    process.exit(1);
  }
})();
// Bootstrap used only for development `cli:dev` to surface loader errors
// more clearly when using `ts-node/esm`.
import util from 'node:util';

(async () => {
  try {
    await import('./cli');
  } catch (err: any) {
    console.error('Error loading CLI (dev):');
    try {
      if (err && typeof err === 'object') console.error(util.inspect(err, { depth: null }));
      else console.error(err);
    } catch (_) {
      console.error(String(err));
    }
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
