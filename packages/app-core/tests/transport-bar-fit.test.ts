/**
 * @jest-environment jsdom
 */
import { attachTransportBarFit } from '../src/playback/transport-bar-fit';

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
});

describe('attachTransportBarFit', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('raises fit level when main content overflows', () => {
    const transport = document.createElement('div');
    transport.className = 'bb-transport';
    const main = document.createElement('div');
    main.className = 'bb-transport__main';
    main.appendChild(document.createElement('div'));
    transport.appendChild(main);
    document.body.appendChild(transport);

    Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => 300 });
    Object.defineProperty(main, 'scrollWidth', {
      configurable: true,
      get: () => (transport.dataset.fitLevel === '0' || !transport.dataset.fitLevel ? 500 : 280),
    });
    Object.defineProperty(transport, 'clientWidth', { configurable: true, get: () => 400 });
    Object.defineProperty(transport, 'scrollWidth', { configurable: true, get: () => 400 });

    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof requestAnimationFrame;

    const detach = attachTransportBarFit(transport);
    expect(transport.dataset.fitLevel).toBe('1');

    globalThis.requestAnimationFrame = originalRaf;
    detach();
  });

  test('no-ops when .bb-transport__main is missing', () => {
    const el = document.createElement('div');
    const detach = attachTransportBarFit(el);
    expect(() => detach()).not.toThrow();
  });
});
