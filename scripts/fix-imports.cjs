#!/usr/bin/env node
/**
 * DEPRECATED: `scripts/fix-imports.cjs` kept as a no-op placeholder.
 *
 * This project now rewrites TypeScript source import specifiers to include
 * explicit `.js` extensions at source-level (see `scripts/add-js-extensions.cjs`).
 * The post-build compiled-file patcher is no longer required and has been
 * intentionally retired to avoid double-processing and accidental overwrites.
 */
console.log('scripts/fix-imports.cjs is deprecated and intentionally disabled.');
process.exit(0);
