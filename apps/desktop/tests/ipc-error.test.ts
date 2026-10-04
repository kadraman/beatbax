import { stripIpcErrorPrefix } from '../src/shared/ipc-error';

describe('stripIpcErrorPrefix', () => {
  it('removes the Electron invoke wrapper and inner Error prefix', () => {
    expect(stripIpcErrorPrefix(
      "Error invoking remote method 'desktop:fetch-remote-asset': Error: Remote asset host 'somewhere.com' is not in the Desktop allowlist. Add it under Settings → Advanced → Remote host allowlist.",
    )).toBe(
      "Remote asset host 'somewhere.com' is not in the Desktop allowlist. Add it under Settings → Advanced → Remote host allowlist.",
    );
  });

  it('leaves messages without the wrapper unchanged', () => {
    expect(stripIpcErrorPrefix('Remote asset request timed out.')).toBe('Remote asset request timed out.');
  });

  it('strips a bare Error: prefix', () => {
    expect(stripIpcErrorPrefix('Error: HTTP 404')).toBe('HTTP 404');
  });
});
