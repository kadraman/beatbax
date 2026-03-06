/**
 * Tests for openFilePicker — cancel / cleanup path
 */

import { openFilePicker } from '../src/import/file-loader';

// Helper: return the hidden <input> appended to body (if any)
function pickerInput(): HTMLInputElement | null {
  return document.body.querySelector<HTMLInputElement>('input[type="file"]');
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── Cancel / cleanup path (requires fake timers for the 300 ms delay) ───────

describe('openFilePicker — cancel cleanup', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function tickAndFlush(ms = 300) {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  }

  it('appends a hidden input immediately after calling openFilePicker()', () => {
    openFilePicker();
    expect(pickerInput()).not.toBeNull();
  });

  it('removes the input when window focus fires (user cancelled)', async () => {
    openFilePicker();
    expect(pickerInput()).not.toBeNull();

    // Simulate the browser returning focus after the picker closes with no selection
    window.dispatchEvent(new Event('focus'));

    await tickAndFlush(300);

    expect(pickerInput()).toBeNull();
  });

  it('removes the input only once when both change (empty) and focus fire', async () => {
    openFilePicker();
    const input = pickerInput()!;

    // change fires first with no files selected
    Object.defineProperty(input, 'files', { value: null });
    input.dispatchEvent(new Event('change'));

    // then focus arrives (as it would on some browsers)
    window.dispatchEvent(new Event('focus'));
    await tickAndFlush(300);

    // Input is gone and no double-removeChild error was thrown
    expect(pickerInput()).toBeNull();
  });

  it('does NOT remove the input before the focus delay elapses', () => {
    openFilePicker();
    window.dispatchEvent(new Event('focus'));

    // Do NOT advance timers — input must still be present
    expect(pickerInput()).not.toBeNull();
  });
});

// ─── Successful selection (real timers; FileReader needs real async I/O) ─────

describe('openFilePicker — successful selection', () => {
  // Use a helper that flushes pending microtasks without fake timers
  const flushPromises = () => new Promise<void>(r => setTimeout(r, 50));

  it('calls onLoad with filename and content, then removes the input', async () => {
    const onLoad = jest.fn();
    openFilePicker({ onLoad });

    const input = pickerInput()!;

    const file = new File(['chip gameboy\nbpm 120'], 'demo.bax', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: { 0: file, length: 1 } });

    input.dispatchEvent(new Event('change'));

    await flushPromises();

    expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'demo.bax' })
    );
    expect(pickerInput()).toBeNull();
  });

  it('window focus after a successful selection does not throw', async () => {
    openFilePicker({ onLoad: jest.fn() });
    const input = pickerInput()!;

    const file = new File(['bpm 120'], 'song.bax', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: { 0: file, length: 1 } });
    input.dispatchEvent(new Event('change'));

    await flushPromises();

    // Focus arrives after change already cleaned up — must not throw
    window.dispatchEvent(new Event('focus'));
    await flushPromises();

    expect(pickerInput()).toBeNull();
  });
});
