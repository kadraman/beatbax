/**
 * Keyboard Shortcuts — centralised registry for global keyboard bindings.
 *
 * Usage:
 *   const ks = new KeyboardShortcuts();
 *   ks.register({ key: 's', ctrlKey: true, description: 'Save', action: save });
 *   ks.mount();   // starts listening
 *   ks.dispose(); // stops listening (e.g. during HMR)
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:keyboard-shortcuts');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShortcutDescriptor {
  /** The key value as per KeyboardEvent.key (case-insensitive). */
  key: string;
  /** Require Ctrl / Cmd key. */
  ctrlKey?: boolean;
  /** Require Shift key. */
  shiftKey?: boolean;
  /** Require Alt / Option key. */
  altKey?: boolean;
  /** Human-readable description shown in help panels. */
  description: string;
  /** The action to run when the shortcut fires. */
  action: () => void;
  /**
   * When true the shortcut fires even when focus is inside a text input,
   * textarea, or contenteditable. Defaults to false.
   */
  allowInInput?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise a key string so comparisons are case-insensitive and consistent.
 * Special cases: ' ' (space) becomes 'space'.
 */
function normaliseKey(key: string): string {
  if (key === ' ') return 'space';
  return key.toLowerCase();
}

/** Build a canonical string ID for a descriptor, used for deduplication. */
export function shortcutId(d: Pick<ShortcutDescriptor, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>): string {
  const parts: string[] = [];
  if (d.ctrlKey) parts.push('ctrl');
  if (d.altKey) parts.push('alt');
  if (d.shiftKey) parts.push('shift');
  parts.push(normaliseKey(d.key));
  return parts.join('+');
}

/** Return true when the event originates from an editable target. */
function isInInput(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = (target as any).tagName?.toUpperCase?.();
  if (!tag) return false;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

// ─── KeyboardShortcuts ────────────────────────────────────────────────────────

export class KeyboardShortcuts {
  private shortcuts = new Map<string, ShortcutDescriptor>();
  private abortController: AbortController | null = null;

  /**
   * Register a shortcut.  If a shortcut with the same modifier+key combination
   * already exists it is replaced and a warning is logged.
   */
  register(descriptor: ShortcutDescriptor): void {
    const id = shortcutId(descriptor);
    if (this.shortcuts.has(id)) {
      log.warn(`Shortcut "${id}" is being overwritten (was: "${this.shortcuts.get(id)!.description}")`);
    }
    this.shortcuts.set(id, descriptor);
    log.debug(`Registered shortcut: ${id} — ${descriptor.description}`);
  }

  /** Remove a previously registered shortcut by its modifier+key combination. */
  unregister(descriptor: Pick<ShortcutDescriptor, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>): void {
    const id = shortcutId(descriptor);
    this.shortcuts.delete(id);
    log.debug(`Unregistered shortcut: ${id}`);
  }

  /** Start listening for keyboard events on the given target (default: window). */
  mount(target: EventTarget = window): void {
    if (this.abortController) {
      log.warn('KeyboardShortcuts already mounted — call dispose() first');
      return;
    }
    this.abortController = new AbortController();
    target.addEventListener(
      'keydown',
      (e) => this.handleKeyDown(e as KeyboardEvent),
      { signal: this.abortController.signal }
    );
    log.debug('KeyboardShortcuts mounted');
  }

  /** Stop listening for keyboard events and release all resources. */
  dispose(): void {
    this.abortController?.abort();
    this.abortController = null;
    log.debug('KeyboardShortcuts disposed');
  }

  /** Return all registered shortcuts (e.g. for a help panel). */
  list(): ReadonlyArray<ShortcutDescriptor> {
    return Array.from(this.shortcuts.values());
  }

  /** Remove all registered shortcuts without disposing the listener. */
  clear(): void {
    this.shortcuts.clear();
  }

  // ── private ────────────────────────────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    const id = shortcutId({
      key: e.key,
      ctrlKey: e.ctrlKey || e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    });

    const descriptor = this.shortcuts.get(id);
    if (!descriptor) return;

    if (isInInput(e) && !descriptor.allowInInput) return;

    log.debug(`Shortcut fired: ${id}`);
    e.preventDefault();
    descriptor.action();
  }
}
