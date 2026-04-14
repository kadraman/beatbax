import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// This script ensures the latest local plugins are linked into web-ui's node_modules for development.
// Usage: node scripts/prepare-plugins.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const linkScript = path.join(repoRoot, 'scripts', 'link-local-plugins.cjs');

try {
  execSync(`node "${linkScript}"`, { stdio: 'inherit' });
  console.log('Local plugins prepared for web-ui.');
} catch (err) {
  console.error('Failed to prepare local plugins:', err);
  process.exit(1);
}
