/**
 * Allow the Desktop renderer import map under a restrictive CSP (spec 111).
 * Hashes the exact importmap script body and appends 'sha256-…' to script-src
 * so the map can run without opening script-src to 'unsafe-inline'.
 */

import { createHash } from 'node:crypto';

const IMPORTMAP_SCRIPT_RE = /<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i;
// CSP values use single-quoted keywords ('self', …) inside a double-quoted attribute.
const CSP_CONTENT_RE =
  /(http-equiv\s*=\s*["']Content-Security-Policy["'][\s\S]*?content\s*=\s*")([^"]*)(")/i;

export function extractImportMapScriptBody(html: string): string | null {
  const match = html.match(IMPORTMAP_SCRIPT_RE);
  return match ? match[1]! : null;
}

/** CSP hashes are over UTF-8 script text; normalize CRLF so Windows checkouts match Chromium/Linux. */
export function normalizeImportMapBody(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function sha256CspHash(source: string): string {
  const digest = createHash('sha256').update(source, 'utf8').digest('base64');
  return `'sha256-${digest}'`;
}

export function injectImportMapCspHash(html: string): string {
  const body = extractImportMapScriptBody(html);
  if (body === null) return html;
  const normalized = normalizeImportMapBody(body);
  const hash = sha256CspHash(normalized);

  let nextHtml = html;
  if (body !== normalized) {
    nextHtml = nextHtml.replace(IMPORTMAP_SCRIPT_RE, `<script type="importmap">${normalized}</script>`);
  }

  return nextHtml.replace(CSP_CONTENT_RE, (full, prefix: string, content: string, suffix: string) => {
    if (!/\bscript-src\b/.test(content) || content.includes(hash)) return full;
    const next = content.replace(/\bscript-src\b([^;]*)/, (_s, rest: string) => `script-src${rest} ${hash}`);
    return `${prefix}${next}${suffix}`;
  });
}

export function allowImportMapCspPlugin(): {
  name: string;
  transformIndexHtml(html: string): string;
} {
  return {
    name: 'beatbax-allow-importmap-csp',
    transformIndexHtml(html) {
      return injectImportMapCspHash(html);
    },
  };
}
