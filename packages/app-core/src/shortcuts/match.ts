import type { ShortcutBinding } from './types.js';

/**
 * Normalise a key string so comparisons are case-insensitive and consistent.
 * Special cases: ' ' (space) becomes 'space'.
 */
export function normaliseKey(key: string): string {
  if (key === ' ') return 'space';
  return key.toLowerCase();
}

export function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return null;
}

/** Build a canonical string ID for a binding, used for deduplication. */
export function shortcutId(binding: Pick<ShortcutBinding, 'key' | 'ctrl' | 'alt' | 'shift'>): string;
export function shortcutId(binding: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): string;
export function shortcutId(binding: {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): string {
  const parts: string[] = [];
  const ctrl = binding.ctrl ?? binding.ctrlKey;
  const alt = binding.alt ?? binding.altKey;
  const shift = binding.shift ?? binding.shiftKey;
  if (ctrl) parts.push('ctrl');
  if (alt) parts.push('alt');
  if (shift) parts.push('shift');
  parts.push(normaliseKey(binding.key));
  return parts.join('+');
}

export interface ModifierState {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Modifier candidates for matching, including AltGr tolerance on desktop layouts. */
export function modifierCandidates(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): ModifierState[] {
  const ctrlKey = event.ctrlKey || event.metaKey;
  const candidates: ModifierState[] = [
    { ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey },
  ];
  // Some desktop/Linux layouts report AltGraph-style chords as Ctrl+Alt.
  if (ctrlKey && event.altKey && !event.metaKey) {
    candidates.push({ ctrlKey: false, shiftKey: event.shiftKey, altKey: event.altKey });
  }
  return candidates;
}

export function keyCandidates(event: Pick<KeyboardEvent, 'key' | 'code'>): string[] {
  return [event.key, keyFromCode(event.code)].filter((key): key is string => Boolean(key));
}

export function bindingMatchesEvent(
  binding: ShortcutBinding,
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
): boolean {
  const modifiers = modifierCandidates(event);
  const keys = keyCandidates(event);
  for (const key of keys) {
    for (const mods of modifiers) {
      const id = shortcutId({
        key,
        ctrlKey: mods.ctrlKey,
        altKey: mods.altKey,
        shiftKey: mods.shiftKey,
      });
      if (id === shortcutId(binding)) return true;
    }
  }
  return false;
}
