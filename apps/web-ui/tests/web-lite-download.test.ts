import { downloadText } from '@beatbax/app-core/export/download-helper';

jest.mock('@beatbax/app-core/export/download-helper', () => ({
  downloadText: jest.fn(),
  sanitizeFilename: (s: string) => s,
}));

describe('download .bax helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('downloadText can serialize editor content as .bax', () => {
    const content = 'chip gameboy\nbpm 120\nplay';
    downloadText(content, 'my-song.bax', 'text/plain');
    expect(downloadText).toHaveBeenCalledWith(content, 'my-song.bax', 'text/plain');
  });
});
