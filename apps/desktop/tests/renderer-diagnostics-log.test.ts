import { EventBus } from '@beatbax/app-core/utils/event-bus';
import { installDiagnosticsForwarder, logDiagnostics } from '../src/renderer/src/lib/diagnostics-log';

describe('renderer diagnostics forwarder', () => {
  const sent = jest.fn();

  beforeEach(() => {
    sent.mockReset();
    (window as unknown as { electronAPI: unknown }).electronAPI = { logDiagnostics: sent };
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('forwards playback and export errors with stacks', () => {
    const bus = new EventBus();
    const dispose = installDiagnosticsForwarder(bus);
    const error = new Error('AudioContext failed');
    bus.emit('playback:error', { error, kind: 'runtime' });
    bus.emit('export:error', { format: 'uge', error: new Error('too many instruments') });

    expect(sent).toHaveBeenNthCalledWith(1, {
      level: 'error',
      source: 'playback',
      message: 'AudioContext failed',
      stack: error.stack,
    });
    expect(sent.mock.calls[1][0]).toMatchObject({
      level: 'error',
      source: 'export',
      message: 'Export uge failed: too many instruments',
    });
    dispose();
  });

  it('forwards only warning and error Output messages', () => {
    const bus = new EventBus();
    const dispose = installDiagnosticsForwarder(bus);
    bus.emit('output:message', { type: 'info', message: 'Loaded song' });
    bus.emit('output:message', { type: 'success', message: 'Exported' });
    bus.emit('output:message', { type: 'warning', message: 'DMC sample blocked', source: 'playback' });
    bus.emit('output:message', { type: 'error', message: 'Something failed' });

    expect(sent.mock.calls.map(([entry]) => entry)).toEqual([
      { level: 'warn', source: 'playback', message: 'DMC sample blocked' },
      { level: 'error', source: 'output', message: 'Something failed' },
    ]);
    dispose();
  });

  it('does not forward parse errors, which quote song text', () => {
    const bus = new EventBus();
    const dispose = installDiagnosticsForwarder(bus);
    bus.emit('parse:error', { error: new Error('pat melody = C4 ?'), message: 'pat melody = C4 ?' });
    expect(sent).not.toHaveBeenCalled();
    dispose();
  });

  it('does not forward source-kind playback errors, which quote song text', () => {
    const bus = new EventBus();
    const dispose = installDiagnosticsForwarder(bus);
    bus.emit('playback:error', { error: new Error('pat melody = C4 ?'), kind: 'source' });
    expect(sent).not.toHaveBeenCalled();
    dispose();
  });

  it('stops forwarding after dispose and tolerates a missing bridge', () => {
    const bus = new EventBus();
    installDiagnosticsForwarder(bus)();
    bus.emit('playback:error', { error: new Error('late'), kind: 'runtime' });
    expect(sent).not.toHaveBeenCalled();

    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    expect(() => logDiagnostics('error', 'renderer', 'no bridge')).not.toThrow();
  });
});
