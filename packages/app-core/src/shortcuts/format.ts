import type { ClientProfile } from '../client-profile.js';
import type { ShortcutBinding, ShortcutCommandId, ShortcutPlatform } from './types.js';
import { normaliseKey } from './match.js';
import { getShortcutBinding } from './catalog.js';

function displayKey(key: string): string {
  const raw = key;
  const lower = normaliseKey(raw);
  if (raw === ' ') return 'Space';
  if (lower === 'escape') return 'Esc';
  if (lower === 'enter') return 'Enter';
  if (lower === 'f1') return 'F1';
  if (raw === '`') return '`';
  if (raw.length === 1) return raw.toUpperCase();
  return raw;
}

function ctrlLabel(platform: ShortcutPlatform, electronNative = false): string {
  if (platform === 'darwin') return electronNative ? 'Cmd' : 'Cmd';
  return 'Ctrl';
}

/** Primary modifier label for standard edit shortcuts not in the catalog. */
export function primaryModifierLabel(platform: ShortcutPlatform): string {
  return ctrlLabel(platform, false);
}

function altLabel(platform: ShortcutPlatform, electronNative = false): string {
  if (electronNative && platform === 'darwin') return 'Option';
  return 'Alt';
}

function formatParts(
  binding: ShortcutBinding,
  platform: ShortcutPlatform,
  electronNative = false,
): string[] {
  const parts: string[] = [];
  if (binding.ctrl) parts.push(ctrlLabel(platform, electronNative));
  if (binding.alt) parts.push(altLabel(platform, electronNative));
  if (binding.shift) parts.push('Shift');
  parts.push(displayKey(binding.key));
  return parts;
}

/** Human-readable shortcut string, e.g. "Cmd+Shift+P" or "Ctrl+Shift+P". */
export function formatShortcut(
  binding: ShortcutBinding,
  platform: ShortcutPlatform,
): string {
  return formatParts(binding, platform, false).join('+');
}

/** Electron accelerator string, e.g. "CmdOrCtrl+Shift+P". */
export function toElectronAccelerator(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('CmdOrCtrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  parts.push(displayKey(binding.key));
  return parts.join('+');
}

/** Key chips for help panels, e.g. ['Cmd', 'Shift', 'P']. */
export function bindingToKeyArray(
  binding: ShortcutBinding,
  platform: ShortcutPlatform,
): string[] {
  return formatParts(binding, platform, false);
}

/** Detect platform for in-renderer shortcut labels. */
export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof window !== 'undefined') {
    const electronPlatform = (window as Window & {
      electronAPI?: { getPlatform?: () => string };
    }).electronAPI?.getPlatform?.();
    if (electronPlatform === 'darwin' || electronPlatform === 'win32' || electronPlatform === 'linux') {
      return electronPlatform;
    }
    if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
      return 'darwin';
    }
  }
  return 'web';
}

export function formatCommandShortcut(
  id: ShortcutCommandId,
  profile: ClientProfile,
  platform: ShortcutPlatform = detectShortcutPlatform(),
): string {
  const binding = getShortcutBinding(id, profile);
  if (!binding) return '';
  return formatShortcut(binding, platform);
}

export function electronAcceleratorForCommand(
  id: ShortcutCommandId,
  profile: ClientProfile,
): string | undefined {
  const binding = getShortcutBinding(id, profile);
  if (!binding) return undefined;
  return toElectronAccelerator(binding);
}
