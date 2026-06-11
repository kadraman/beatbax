/** @jest-environment node */

import { basenameFromPath } from '../src/main/path-utils';

describe('basenameFromPath', () => {
  it('handles POSIX paths', () => {
    expect(basenameFromPath('/home/runner/music/duck_tales.bax')).toBe('duck_tales.bax');
  });

  it('handles Windows paths on any platform', () => {
    expect(basenameFromPath('C:\\music\\duck_tales.bax')).toBe('duck_tales.bax');
  });
});
