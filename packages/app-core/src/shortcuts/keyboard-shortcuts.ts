import { createLogger } from '@beatbax/engine/util/logger';
import {
  bindingMatchesEvent,
  keyCandidates,
  modifierCandidates,
  shortcutId,
} from './match.js';
import type { ShortcutBinding } from './types.js';
import { bindingToDescriptor } from './types.js';

const log = createLogger('app-core:keyboard-shortcuts');

export interface ShortcutMetadata {
  commandId?: string;
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  description: string;
  category?: string;
  desktopOnly?: boolean;
  allowInInput?: boolean;
  helpOnly?: boolean;
}

export interface ShortcutDescriptor extends ShortcutMetadata {
  action: () => void;
}

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName?.toUpperCase?.();
  const htmlElement = element as HTMLElement;

  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    htmlElement.isContentEditable ||
    element.closest('[contenteditable="true"], [contenteditable="plaintext-only"], .monaco-editor') !== null
  );
}

function isInInput(e: KeyboardEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  const active = typeof document !== 'undefined' && document.activeElement instanceof Element
    ? document.activeElement
    : null;

  return isEditableElement(target) || isEditableElement(active);
}

export function descriptorFromBinding(
  binding: ShortcutBinding,
  metadata: Omit<ShortcutMetadata, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  action: () => void,
): ShortcutDescriptor {
  return {
    ...metadata,
    ...bindingToDescriptor(binding),
    action,
  };
}

export { shortcutId };

export class KeyboardShortcuts {
  private shortcuts = new Map<string, ShortcutDescriptor>();
  private abortController: AbortController | null = null;
  private readonly useCapture: boolean;

  constructor(options?: { useCapture?: boolean }) {
    this.useCapture = options?.useCapture ?? true;
  }

  register(descriptor: ShortcutDescriptor): void {
    const id = shortcutId(descriptor);
    if (this.shortcuts.has(id)) {
      log.warn(`Shortcut "${id}" is being overwritten (was: "${this.shortcuts.get(id)!.description}")`);
    }
    this.shortcuts.set(id, descriptor);
    log.debug(`Registered shortcut: ${id} - ${descriptor.description}`);
  }

  unregister(descriptor: Pick<ShortcutDescriptor, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>): void {
    const id = shortcutId(descriptor);
    this.shortcuts.delete(id);
    log.debug(`Unregistered shortcut: ${id}`);
  }

  mount(target: EventTarget = window): void {
    if (this.abortController) {
      log.warn('KeyboardShortcuts already mounted - call dispose() first');
      return;
    }
    this.abortController = new AbortController();
    target.addEventListener(
      'keydown',
      (e) => this.handleKeyDown(e as KeyboardEvent),
      { capture: this.useCapture, signal: this.abortController.signal },
    );
    log.debug('KeyboardShortcuts mounted');
  }

  dispose(): void {
    this.abortController?.abort();
    this.abortController = null;
    log.debug('KeyboardShortcuts disposed');
  }

  list(): ReadonlyArray<ShortcutDescriptor> {
    return Array.from(this.shortcuts.values());
  }

  clear(): void {
    this.shortcuts.clear();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const modifiers = modifierCandidates(e);
    const keys = keyCandidates(e);

    let matchedDescriptor: ShortcutDescriptor | undefined;
    for (const key of keys) {
      for (const mods of modifiers) {
        const id = shortcutId({
          key,
          ctrlKey: mods.ctrlKey,
          altKey: mods.altKey,
          shiftKey: mods.shiftKey,
        });
        const descriptor = this.shortcuts.get(id);
        if (descriptor) {
          matchedDescriptor = descriptor;
          break;
        }
      }
      if (matchedDescriptor) break;
    }

    if (!matchedDescriptor) return;
    if (isInInput(e) && !matchedDescriptor.allowInInput) return;

    log.debug(`Shortcut fired: ${shortcutId(matchedDescriptor)}`);
    e.preventDefault();
    matchedDescriptor.action();
  }
}

export function bindingMatchesRegistered(
  binding: ShortcutBinding,
  event: KeyboardEvent,
): boolean {
  return bindingMatchesEvent(binding, event);
}
