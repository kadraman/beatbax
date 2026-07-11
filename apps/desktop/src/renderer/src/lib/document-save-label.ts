import type { DocumentSaveState } from '@beatbax/app-core/stores/editor.store';

export type DocumentSaveLabelVariant = 'idle' | 'modified' | 'saving' | 'saved' | 'error';

export interface DocumentSaveLabel {
  visible: boolean;
  label: string;
  variant: DocumentSaveLabelVariant;
}

/** Resolve the status-bar document save indicator from store state. */
export function resolveDocumentSaveLabel(
  saveState: DocumentSaveState,
  dirty: boolean,
): DocumentSaveLabel {
  if (saveState === 'saving') {
    return { visible: true, label: 'Saving…', variant: 'saving' };
  }
  if (saveState === 'error') {
    return { visible: true, label: 'Save failed', variant: 'error' };
  }
  if (dirty) {
    return { visible: true, label: 'Modified', variant: 'modified' };
  }
  if (saveState === 'saved') {
    return { visible: true, label: 'Saved', variant: 'saved' };
  }
  return { visible: false, label: '', variant: 'idle' };
}
