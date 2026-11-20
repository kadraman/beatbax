/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  extractImportMapScriptBody,
  injectImportMapCspHash,
  normalizeImportMapBody,
  sha256CspHash,
} from '../scripts/allow-importmap-csp';

describe('allow-importmap-csp', () => {
  const indexHtml = readFileSync(
    path.resolve(__dirname, '../src/renderer/index.html'),
    'utf8'
  );

  it('appends a sha256 hash of the import map body to script-src', () => {
    const body = extractImportMapScriptBody(indexHtml);
    expect(body).not.toBeNull();
    const hash = sha256CspHash(normalizeImportMapBody(body!));
    const transformed = injectImportMapCspHash(indexHtml);

    expect(hash).toBe("'sha256-gjuj5TQoQe4gCoWiaVc0HPQHRY6rAbVBh+3lmDsEcrE='");
    expect(transformed).toContain(hash);
    expect(transformed).toMatch(
      new RegExp(`script-src[^;]*${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    );
    expect(transformed).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('is idempotent when the hash is already present', () => {
    const once = injectImportMapCspHash(indexHtml);
    expect(injectImportMapCspHash(once)).toBe(once);
  });
});
