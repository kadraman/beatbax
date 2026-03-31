/**
 * Unit tests for DragDropHandler
 */

import { DragDropHandler } from '../src/import/drag-drop-handler';

// ─── Mock file-loader ────────────────────────────────────────────────────────

jest.mock('../src/import/file-loader', () => ({
  readFileAsText: jest.fn(),
}));

import { readFileAsText } from '../src/import/file-loader';
const mockReadFile = readFileAsText as jest.MockedFunction<typeof readFileAsText>;

// ─── Deterministic async flush ───────────────────────────────────────────────
// Drains the microtask queue without relying on real-time delays.
// handleDrop's only async step is a single `await readFileAsText(...)`, so
// two microtask flushes are sufficient to settle even a rejection path.
const flushPromises = () => Promise.resolve().then(() => Promise.resolve());

// ─── DragEvent helpers ───────────────────────────────────────────────────────

function makeFile(name: string, content = 'bpm 120', type = 'text/plain'): File {
  return new File([content], name, { type });
}

function makeDragEvent(
  eventType: string,
  files: File[] = []
): DragEvent {
  const dataTransfer = {
    files: files as unknown as FileList,
    dropEffect: '' as DataTransfer['dropEffect'],
  };
  const event = new Event(eventType, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer, configurable: true });
  return event;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DragDropHandler', () => {
  let container: HTMLElement;
  let handler: DragDropHandler;
  let onDrop: jest.Mock;
  let onInvalidFile: jest.Mock;
  let onError: jest.Mock;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    onDrop = jest.fn();
    onInvalidFile = jest.fn();
    onError = jest.fn();

    handler = new DragDropHandler(container, {
      onDrop,
      onInvalidFile,
      onError,
      showOverlay: false, // keep DOM assertions simple
    });

    mockReadFile.mockReset();
  });

  afterEach(() => {
    handler.dispose();
    document.body.removeChild(container);
  });

  // ── dragenter / dragleave ────────────────────────────────────────────────

  it('adds drag-over class on dragenter', () => {
    container.dispatchEvent(makeDragEvent('dragenter'));
    expect(container.classList.contains('drag-over')).toBe(false); // overlay disabled
  });

  it('prevents default on dragover', () => {
    const event = makeDragEvent('dragover');
    const spy = jest.spyOn(event, 'preventDefault');
    container.dispatchEvent(event);
    expect(spy).toHaveBeenCalled();
  });

  // ── drop — accepted file ─────────────────────────────────────────────────

  it('calls onDrop with filename and content for an accepted .bax file', async () => {
    mockReadFile.mockResolvedValue('chip gameboy\nbpm 120');

    const file = makeFile('song.bax');
    const event = makeDragEvent('drop', [file]);
    container.dispatchEvent(event);

    // wait for async handleDrop
    await flushPromises();

    expect(onDrop).toHaveBeenCalledWith('song.bax', 'chip gameboy\nbpm 120');
    expect(onInvalidFile).not.toHaveBeenCalled();
  });

  it('calls onDrop for an accepted .uge file', async () => {
    mockReadFile.mockResolvedValue('\x55\x47\x45');   // fake UGE bytes as text

    const file = makeFile('track.uge', '\x55\x47\x45', 'application/octet-stream');
    const event = makeDragEvent('drop', [file]);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onDrop).toHaveBeenCalledWith('track.uge', '\x55\x47\x45');
  });

  // ── drop — rejected file ─────────────────────────────────────────────────

  it('calls onInvalidFile and skips onDrop for an unsupported extension', async () => {
    const file = makeFile('music.mp3');
    const event = makeDragEvent('drop', [file]);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onInvalidFile).toHaveBeenCalledWith(
      'music.mp3',
      expect.stringContaining('.mp3')
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('only processes the first valid file when multiple files are dropped', async () => {
    mockReadFile.mockResolvedValue('bpm 160');

    const file1 = makeFile('first.bax');
    const file2 = makeFile('second.bax');
    const event = makeDragEvent('drop', [file1, file2]);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith('first.bax', 'bpm 160');
  });

  it('calls onInvalidFile for every invalid file and then calls onDrop for the first valid one', async () => {
    mockReadFile.mockResolvedValue('bpm 100');

    const bad = makeFile('image.png');
    const good = makeFile('song.bax');
    const event = makeDragEvent('drop', [bad, good]);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onInvalidFile).toHaveBeenCalledWith('image.png', expect.any(String));
    expect(onDrop).toHaveBeenCalledWith('song.bax', 'bpm 100');
  });

  // ── drop — read error ────────────────────────────────────────────────────

  it('calls onError when readFileAsText rejects', async () => {
    mockReadFile.mockRejectedValue(new Error('Disk read failed'));

    const file = makeFile('song.bax');
    const event = makeDragEvent('drop', [file]);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Disk read failed' }));
    expect(onDrop).not.toHaveBeenCalled();
  });

  // ── drop — empty dataTransfer ────────────────────────────────────────────

  it('does nothing when no files are present in the drop event', async () => {
    const event = makeDragEvent('drop', []);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onDrop).not.toHaveBeenCalled();
    expect(onInvalidFile).not.toHaveBeenCalled();
  });

  // ── custom acceptedExtensions ────────────────────────────────────────────

  it('accepts files matching custom acceptedExtensions', async () => {
    handler.dispose();
    document.body.removeChild(container);

    container = document.createElement('div');
    document.body.appendChild(container);

    mockReadFile.mockResolvedValue('data');

    handler = new DragDropHandler(container, {
      acceptedExtensions: ['.txt'],
      onDrop,
      onInvalidFile,
      showOverlay: false,
    });

    const event = makeDragEvent('drop', [makeFile('notes.txt')]);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onDrop).toHaveBeenCalledWith('notes.txt', 'data');
  });

  // ── dispose ──────────────────────────────────────────────────────────────

  it('dispose() stops responding to drop events', async () => {
    handler.dispose();

    mockReadFile.mockResolvedValue('bpm 120');
    const event = makeDragEvent('drop', [makeFile('song.bax')]);
    container.dispatchEvent(event);

    await flushPromises();

    expect(onDrop).not.toHaveBeenCalled();
  });
});
