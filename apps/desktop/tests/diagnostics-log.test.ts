/** @jest-environment node */

import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  createDiagnosticsLog,
  createRendererLogGate,
  describeErrorSafely,
  formatDiagnosticsEntry,
  redactDiagnostics,
} from '../src/main/diagnostics-log';

const fixedNow = (): Date => new Date('2026-10-02T19:14:03.123Z');

describe('formatDiagnosticsEntry', () => {
  it('writes one line with timestamp, level, and source', () => {
    expect(formatDiagnosticsEntry(fixedNow(), 'warn', 'playback', 'Sample failed'))
      .toBe('2026-10-02T19:14:03.123Z [warn] [playback] Sample failed\n');
  });

  it('indents stack trace and continuation lines', () => {
    const entry = formatDiagnosticsEntry(fixedNow(), 'error', 'main', 'Boom\nsecond line', 'Error: Boom\n    at fn (file.ts:1:1)');
    expect(entry).toBe([
      '2026-10-02T19:14:03.123Z [error] [main] Boom',
      '  second line',
      '  Error: Boom',
      '  at fn (file.ts:1:1)',
      '',
    ].join('\n'));
  });
});

describe('redactDiagnostics', () => {
  it('redacts a stored key, bearer headers, and sk- style keys', () => {
    const text = [
      'key my-stored-secret-value used',
      'Authorization: Bearer abc.def-123',
      '{"authorization":"Bearer xyz987654"}',
      'sent Bearer token-abcdef',
      'fallback sk-proj-ABCDEFGH12345678',
    ].join('\n');
    const redacted = redactDiagnostics(text, ['my-stored-secret-value']);
    expect(redacted).not.toContain('my-stored-secret-value');
    expect(redacted).not.toContain('abc.def-123');
    expect(redacted).not.toContain('xyz987654');
    expect(redacted).not.toContain('token-abcdef');
    expect(redacted).not.toContain('sk-proj-ABCDEFGH12345678');
    expect(redacted).toContain('Authorization: [redacted]');
  });

  it('redacts registered secrets of any length', () => {
    expect(redactDiagnostics('key abc used', ['abc'])).toBe('key [redacted] used');
  });

  it('ignores empty secrets', () => {
    expect(redactDiagnostics('unchanged text', [''])).toBe('unchanged text');
  });

  it('redacts the longer secret first when one key prefixes another', () => {
    const redacted = redactDiagnostics('keys abc and abcdef', ['abc', 'abcdef']);
    expect(redacted).toBe('keys [redacted] and [redacted]');
    expect(redacted).not.toContain('def');
  });
});

describe('describeErrorSafely', () => {
  it('omits the message, which can quote a provider body', () => {
    let error: unknown;
    try {
      JSON.parse('{"error":"provider secret reply"');
    } catch (e) {
      error = e;
    }
    expect(describeErrorSafely(error)).toBe('SyntaxError');
  });

  it('includes a system error code from the error or its cause', () => {
    const fetchFailure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect(describeErrorSafely(fetchFailure)).toBe('TypeError ECONNREFUSED');
    expect(describeErrorSafely(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toBe('Error ENOTFOUND');
  });

  it('rejects names and codes that are not plain identifiers', () => {
    const odd = Object.assign(new Error('x'), { code: 'reply: hello' });
    odd.name = 'Provider said: hello';
    expect(describeErrorSafely(odd)).toBe('Error');
    expect(describeErrorSafely('a thrown string')).toBe('Error');
    expect(describeErrorSafely(null)).toBe('Error');
  });
});

describe('createDiagnosticsLog', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-diagnostics-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends entries and takes stacks from errors', async () => {
    const log = createDiagnosticsLog({ dir: path.join(dir, 'logs'), now: fixedNow });
    log.log('info', 'startup', 'BeatBax 0.3.0 (Electron 38.0.0, darwin 25.5.0 arm64)');
    const error = new Error('render failed');
    error.stack = 'Error: render failed\n    at render (app.tsx:2:3)';
    log.log('error', 'renderer', 'Uncaught error', error);
    log.log('warn', 'main', 'Could not open', 'EACCES');
    await log.flush();

    expect(readFileSync(log.filePath, 'utf8')).toBe([
      '2026-10-02T19:14:03.123Z [info] [startup] BeatBax 0.3.0 (Electron 38.0.0, darwin 25.5.0 arm64)',
      '2026-10-02T19:14:03.123Z [error] [renderer] Uncaught error',
      '  Error: render failed',
      '  at render (app.tsx:2:3)',
      '2026-10-02T19:14:03.123Z [warn] [main] Could not open: EACCES',
      '',
    ].join('\n'));
  });

  it('rotates at the size limit and keeps one previous file', async () => {
    const log = createDiagnosticsLog({ dir, maxBytes: 200, now: fixedNow });
    for (let i = 0; i < 12; i += 1) log.append('warn', 'test', `entry ${i} ${'x'.repeat(40)}`);
    await log.flush();

    const current = readFileSync(path.join(dir, 'beatbax.log'), 'utf8');
    const previous = readFileSync(path.join(dir, 'beatbax.old.log'), 'utf8');
    expect(Buffer.byteLength(current)).toBeLessThanOrEqual(200);
    expect(Buffer.byteLength(previous)).toBeLessThanOrEqual(200);
    expect(current).toContain('entry 11');
    expect(previous).not.toContain('entry 0 ');
    expect(existsSync(path.join(dir, 'beatbax.old.old.log'))).toBe(false);
  });

  it('counts an existing file towards the size limit', async () => {
    writeFileSync(path.join(dir, 'beatbax.log'), 'x'.repeat(190));
    const log = createDiagnosticsLog({ dir, maxBytes: 200, now: fixedNow });
    log.append('warn', 'test', 'after restart');
    await log.flush();
    expect(readFileSync(path.join(dir, 'beatbax.old.log'), 'utf8')).toBe('x'.repeat(190));
    expect(readFileSync(path.join(dir, 'beatbax.log'), 'utf8')).toContain('after restart');
  });

  it('redacts registered secrets and clears them', async () => {
    const log = createDiagnosticsLog({ dir, now: fixedNow });
    log.setSecret('ai-api-key', 'super-secret-key-1');
    log.append('error', 'copilot', 'request with super-secret-key-1 failed');
    log.setSecret('ai-api-key', '');
    log.append('error', 'copilot', 'later super-secret-key-1');
    await log.flush();
    const text = readFileSync(log.filePath, 'utf8');
    expect(text).toContain('request with [redacted] failed');
    expect(text).toContain('later super-secret-key-1');
  });

  it('writes logSync entries before returning, redacted', () => {
    const log = createDiagnosticsLog({ dir: path.join(dir, 'logs'), now: fixedNow });
    log.setSecret('ai-api-key', 'super-secret-key-1');
    const error = new Error('boom with super-secret-key-1');
    error.stack = 'Error: boom with super-secret-key-1\n    at main (index.ts:1:1)';
    log.logSync('error', 'main', 'Uncaught exception', error);

    expect(readFileSync(log.filePath, 'utf8')).toBe([
      '2026-10-02T19:14:03.123Z [error] [main] Uncaught exception',
      '  Error: boom with [redacted]',
      '  at main (index.ts:1:1)',
      '',
    ].join('\n'));
  });

  it('rotates synchronously at the size limit', () => {
    writeFileSync(path.join(dir, 'beatbax.log'), 'x'.repeat(190));
    const log = createDiagnosticsLog({ dir, maxBytes: 200, now: fixedNow });
    log.logSync('error', 'main', 'Uncaught exception');
    expect(readFileSync(path.join(dir, 'beatbax.old.log'), 'utf8')).toBe('x'.repeat(190));
    expect(readFileSync(path.join(dir, 'beatbax.log'), 'utf8')).toContain('Uncaught exception');
  });

  it('keeps async and sync writes in one size budget', async () => {
    const log = createDiagnosticsLog({ dir, maxBytes: 200, now: fixedNow });
    log.append('warn', 'test', `queued ${'x'.repeat(100)}`);
    await log.flush();
    log.logSync('error', 'main', `fatal ${'y'.repeat(100)}`);
    expect(readFileSync(path.join(dir, 'beatbax.old.log'), 'utf8')).toContain('queued');
    expect(readFileSync(path.join(dir, 'beatbax.log'), 'utf8')).toContain('fatal');
  });

  it('never throws from logSync and falls back when the folder cannot be written', () => {
    const blocker = path.join(dir, 'not-a-directory');
    writeFileSync(blocker, 'file');
    const fallback = jest.fn(() => { throw new Error('console gone'); });
    const log = createDiagnosticsLog({ dir: path.join(blocker, 'logs'), now: fixedNow, fallback });
    expect(() => log.logSync('error', 'main', 'Uncaught exception')).not.toThrow();
    expect(fallback).toHaveBeenCalledWith('error', expect.stringContaining('Uncaught exception'));
  });

  it('falls back silently when the folder cannot be written', async () => {
    const blocker = path.join(dir, 'not-a-directory');
    writeFileSync(blocker, 'file');
    const fallback = jest.fn();
    const log = createDiagnosticsLog({ dir: path.join(blocker, 'logs'), now: fixedNow, fallback });
    log.append('error', 'main', 'first');
    await log.flush();
    log.append('warn', 'main', 'second');
    await log.flush();
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(fallback.mock.calls[1]).toEqual(['warn', expect.stringContaining('second')]);
  });
});

describe('createRendererLogGate', () => {
  it('validates the entry shape', () => {
    const gate = createRendererLogGate();
    expect(gate.accept(1, null)).toBeNull();
    expect(gate.accept(1, { level: 'info', source: 'x', message: 'y' })).toBeNull();
    expect(gate.accept(1, { level: 'warn', source: 3, message: 'y' })).toBeNull();
    expect(gate.accept(1, { level: 'warn', source: 'play back!', message: 'y', stack: 5 }))
      .toEqual({ level: 'warn', source: 'playback', message: 'y' });
  });

  it('truncates long messages and stacks', () => {
    const gate = createRendererLogGate({ maxChars: 10 });
    const entry = gate.accept(1, { level: 'error', source: 'renderer', message: 'm'.repeat(50), stack: 's'.repeat(50) });
    expect(entry?.message).toBe(`${'m'.repeat(10)}… [truncated]`);
    expect(entry?.stack).toBe(`${'s'.repeat(10)}… [truncated]`);
  });

  it('rate-limits per window and reports dropped entries once the window reopens', () => {
    let time = 0;
    const gate = createRendererLogGate({ perMinute: 2, now: () => time });
    const entry = { level: 'warn', source: 'renderer', message: 'flood' };

    expect(gate.takeDropped(1)).toBe(0);
    expect(gate.accept(1, entry)).not.toBeNull();
    expect(gate.accept(1, entry)).not.toBeNull();
    expect(gate.accept(1, entry)).toBeNull();
    expect(gate.accept(1, entry)).toBeNull();
    expect(gate.accept(2, entry)).not.toBeNull();
    expect(gate.takeDropped(1)).toBe(0);

    time = 60_000;
    expect(gate.takeDropped(1)).toBe(2);
    expect(gate.takeDropped(1)).toBe(0);
    expect(gate.accept(1, entry)).not.toBeNull();
  });
});
