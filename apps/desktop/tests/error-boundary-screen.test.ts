import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from '../src/renderer/src/components/ErrorBoundary';

const DEVTOOLS_LAUNCH_FLAG_HINT = 'To inspect this further, restart BeatBax with the --devtools launch flag.';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Exploding(): never {
  throw new Error('renderer exploded');
}

describe('ErrorBoundary fatal screen', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: {
    getDevToolsState: jest.Mock;
    toggleDevTools: jest.Mock;
    openLogsFolder: jest.Mock;
    logDiagnostics: jest.Mock;
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    api = {
      getDevToolsState: jest.fn(),
      toggleDevTools: jest.fn(),
      openLogsFolder: jest.fn().mockResolvedValue(undefined),
      logDiagnostics: jest.fn(),
    };
    (window as unknown as { electronAPI: unknown }).electronAPI = api;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    jest.restoreAllMocks();
  });

  async function renderFailure(): Promise<void> {
    await act(async () => {
      root.render(createElement(ErrorBoundary, null, createElement(Exploding)));
    });
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((el) => el.textContent === label);
  }

  it('offers the logs folder and the --devtools hint when developer tools are off', async () => {
    api.getDevToolsState.mockResolvedValue({ allowed: false, source: 'off', saved: false });
    await renderFailure();

    expect(container.textContent).toContain('renderer exploded');
    expect(container.textContent).toContain(DEVTOOLS_LAUNCH_FLAG_HINT);
    expect(container.textContent).not.toContain('Toggle Developer Tools');
    expect(button('Open developer tools')).toBeUndefined();

    await act(async () => button('Open logs folder')?.click());
    expect(api.openLogsFolder).toHaveBeenCalledTimes(1);

    expect(api.logDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      source: 'renderer',
      message: 'BeatBax Desktop failed to start: renderer exploded',
      stack: expect.stringContaining('renderer exploded'),
    }));
  });

  it('offers Open developer tools when they are allowed', async () => {
    api.getDevToolsState.mockResolvedValue({ allowed: true, source: 'setting', saved: true });
    await renderFailure();

    expect(button('Open logs folder')).toBeDefined();
    expect(container.textContent).not.toContain(DEVTOOLS_LAUNCH_FLAG_HINT);
    await act(async () => button('Open developer tools')?.click());
    expect(api.toggleDevTools).toHaveBeenCalledTimes(1);
  });
});
