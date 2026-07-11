import { resolveDocumentSaveLabel } from '../src/renderer/src/lib/document-save-label';

describe('resolveDocumentSaveLabel', () => {
  it('shows Saving while a write is in progress', () => {
    expect(resolveDocumentSaveLabel('saving', true)).toEqual({
      visible: true,
      label: 'Saving…',
      variant: 'saving',
    });
  });

  it('shows Save failed until the next successful save', () => {
    expect(resolveDocumentSaveLabel('error', false)).toEqual({
      visible: true,
      label: 'Save failed',
      variant: 'error',
    });
  });

  it('prefers Modified over the saved flash when the user keeps typing', () => {
    expect(resolveDocumentSaveLabel('saved', true)).toEqual({
      visible: true,
      label: 'Modified',
      variant: 'modified',
    });
  });

  it('shows Saved briefly after a successful write', () => {
    expect(resolveDocumentSaveLabel('saved', false)).toEqual({
      visible: true,
      label: 'Saved',
      variant: 'saved',
    });
  });

  it('shows Modified when dirty and idle', () => {
    expect(resolveDocumentSaveLabel('idle', true)).toEqual({
      visible: true,
      label: 'Modified',
      variant: 'modified',
    });
  });

  it('hides the indicator when the document is clean', () => {
    expect(resolveDocumentSaveLabel('idle', false)).toEqual({
      visible: false,
      label: '',
      variant: 'idle',
    });
  });
});
