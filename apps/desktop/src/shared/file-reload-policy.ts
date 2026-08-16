/** How BeatBax Desktop reacts when the open `.bax` changes on disk. */
export type FileReloadPolicy = 'reloadIfUnmodified' | 'alwaysAsk' | 'alwaysReload' | 'off';

export type FileReloadDecision = 'ignore' | 'apply' | 'prompt';

export const DEFAULT_FILE_RELOAD_POLICY: FileReloadPolicy = 'reloadIfUnmodified';

const FILE_RELOAD_POLICIES: readonly FileReloadPolicy[] = [
  'reloadIfUnmodified',
  'alwaysAsk',
  'alwaysReload',
  'off',
];

export function normalizeFileReloadPolicy(value: string | undefined | null): FileReloadPolicy {
  if (value && (FILE_RELOAD_POLICIES as readonly string[]).includes(value)) {
    return value as FileReloadPolicy;
  }
  return DEFAULT_FILE_RELOAD_POLICY;
}

/** Decide whether to apply disk content, prompt, or ignore. Unlink is handled separately. */
export function decideFileReload(policy: FileReloadPolicy | string, dirty: boolean): FileReloadDecision {
  const normalized = normalizeFileReloadPolicy(policy);
  if (normalized === 'off') return 'ignore';
  if (normalized === 'alwaysReload') return 'apply';
  if (normalized === 'alwaysAsk') return 'prompt';
  return dirty ? 'prompt' : 'apply';
}

/** True when editor and disk text match, ignoring CR/LF differences. */
export function editorTextEqualsDisk(editorText: string, diskText: string): boolean {
  const normalize = (value: string) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalize(editorText) === normalize(diskText);
}
