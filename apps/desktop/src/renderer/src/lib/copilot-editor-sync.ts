import { editorContent, editorDirty } from '@beatbax/app-core/stores/editor.store';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';

/** Sync stores/events after Copilot (or other tooling) mutates the editor outside normal typing. */
export function notifyEditorContentChanged(
  content: string,
  eventBus: EventBus,
  runParse?: (content: string) => void,
): void {
  editorContent.set(content);
  editorDirty.set(true);
  eventBus.emit('editor:changed', { content });
  runParse?.(content);
}
