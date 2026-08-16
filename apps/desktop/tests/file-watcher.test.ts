/** @jest-environment node */

import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createDocumentFileWatcher, type DocumentFileWatcher } from '../src/main/file-watcher';
import type { DesktopDocumentChangedPayload } from '../src/shared/electron-api';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('createDocumentFileWatcher', () => {
  let tempDir = '';
  let watcher: DocumentFileWatcher | null = null;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-watch-'));
  });

  afterEach(() => {
    watcher?.dispose();
    watcher = null;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects relative paths', () => {
    const instance = createDocumentFileWatcher();
    watcher = instance;
    expect(() => instance.watch('song.bax')).toThrow('Expected an absolute file path.');
  });

  it('does not emit change for markSelfWrite', async () => {
    const events: DesktopDocumentChangedPayload[] = [];
    watcher = createDocumentFileWatcher({
      debounceMs: 40,
      selfWriteWindowMs: 800,
      onChange: (payload) => events.push(payload),
    });
    const filePath = path.join(tempDir, 'song.bax');
    writeFileSync(filePath, 'chip gameboy\n', 'utf8');
    watcher.watch(filePath);
    await delay(120);

    watcher.markSelfWrite(filePath);
    writeFileSync(filePath, 'chip gameboy\nbpm 120\n', 'utf8');
    watcher.markSelfWrite(filePath);
    await delay(250);

    expect(events.filter((event) => event.type === 'change' && event.content?.includes('bpm 120'))).toEqual([]);
  });

  it('does not suppress external changes when markSelfWrite is for another path', async () => {
    const events: DesktopDocumentChangedPayload[] = [];
    watcher = createDocumentFileWatcher({
      debounceMs: 40,
      selfWriteWindowMs: 800,
      onChange: (payload) => events.push(payload),
    });
    const filePath = path.join(tempDir, 'song.bax');
    const exportPath = path.join(tempDir, 'song.uge');
    writeFileSync(filePath, 'chip gameboy\n', 'utf8');
    writeFileSync(exportPath, 'export', 'utf8');
    watcher.watch(filePath);
    await delay(120);

    watcher.markSelfWrite(exportPath);
    writeFileSync(exportPath, 'export-updated', 'utf8');
    writeFileSync(filePath, 'chip gameboy\n; external\n', 'utf8');

    const deadline = Date.now() + 2_000;
    while (
      !events.some((event) => event.type === 'change' && event.content?.includes('; external'))
      && Date.now() < deadline
    ) {
      await delay(40);
    }

    expect(events.some((event) => event.type === 'change' && event.content?.includes('; external'))).toBe(true);
  });

  it('emits change for an external write', async () => {
    const events: DesktopDocumentChangedPayload[] = [];
    watcher = createDocumentFileWatcher({
      debounceMs: 40,
      selfWriteWindowMs: 50,
      onChange: (payload) => events.push(payload),
    });
    const filePath = path.join(tempDir, 'song.bax');
    writeFileSync(filePath, 'chip gameboy\n', 'utf8');
    watcher.watch(filePath);
    await delay(120);

    writeFileSync(filePath, 'chip gameboy\n; external\n', 'utf8');

    const deadline = Date.now() + 2_000;
    while (
      !events.some((event) => event.type === 'change' && event.content?.includes('; external'))
      && Date.now() < deadline
    ) {
      await delay(40);
    }

    expect(events.some((event) => event.type === 'change' && event.content?.includes('; external'))).toBe(true);
  });
});
