/**
 * Unit tests for desktop clipboard export data helper.
 */

import { handleDesktopExportData } from '../src/renderer/src/lib/export-handler';

const SAMPLE = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat melody = C4 E4 G4
seq main = melody
channel 1 => inst lead seq main
play
`;

describe('handleDesktopExportData', () => {
  it('returns raw source for bax format', async () => {
    const data = await handleDesktopExportData('bax', () => SAMPLE);
    expect(data).toBe(SAMPLE);
  });

  it('returns null for empty source', async () => {
    expect(await handleDesktopExportData('json', () => '')).toBeNull();
    expect(await handleDesktopExportData('json', () => '   ')).toBeNull();
  });

  it('returns JSON for json format', async () => {
    const data = await handleDesktopExportData('json', () => SAMPLE);
    expect(data).toBeTruthy();
    const parsed = JSON.parse(data!);
    expect(parsed).toEqual(expect.objectContaining({
      chip: expect.anything(),
    }));
  });

  it('returns null for unsupported binary formats', async () => {
    expect(await handleDesktopExportData('wav', () => SAMPLE)).toBeNull();
    expect(await handleDesktopExportData('midi', () => SAMPLE)).toBeNull();
  });
});
