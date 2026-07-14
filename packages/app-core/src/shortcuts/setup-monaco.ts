import type { ClientCapabilities, ClientProfile } from '../client-profile.js';
import type { editor as MonacoEditor } from 'monaco-editor';
import { bindingToMonacoKeyChord } from './monaco-chord.js';
import { getShortcutBinding } from './catalog.js';
import type { ShortcutCommandId } from './types.js';

export interface MonacoShortcutRegistration {
  commandId: ShortcutCommandId;
  handler: () => void;
  requiresCapability?: keyof ClientCapabilities;
}

export function registerMonacoShortcut(
  editor: MonacoEditor.IStandaloneCodeEditor,
  profile: ClientProfile,
  commandId: ShortcutCommandId,
  handler: () => void,
): void {
  const binding = getShortcutBinding(commandId, profile);
  if (!binding) return;
  const chord = bindingToMonacoKeyChord(binding);
  if (chord == null) return;
  editor.addCommand(chord, handler);
}

export function registerMonacoShortcuts(
  editor: MonacoEditor.IStandaloneCodeEditor,
  profile: ClientProfile,
  registrations: MonacoShortcutRegistration[],
  capabilities: ClientCapabilities,
): void {
  for (const entry of registrations) {
    if (entry.requiresCapability && !capabilities[entry.requiresCapability]) continue;
    registerMonacoShortcut(editor, profile, entry.commandId, entry.handler);
  }
}
