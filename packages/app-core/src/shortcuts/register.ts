import type { ClientCapabilities, ClientProfile } from '../client-profile.js';
import { isFeatureEnabled } from '../utils/feature-flags.js';
import {
  descriptorFromBinding,
  KeyboardShortcuts,
} from './keyboard-shortcuts.js';
import { listCatalogEntries } from './catalog.js';
import { resolveProfileBinding } from './types.js';
import type { ShortcutCommandId } from './types.js';

export type ShortcutHandlers = Partial<Record<ShortcutCommandId, () => void>>;

export interface RegisterCatalogShortcutsOptions {
  shortcuts: KeyboardShortcuts;
  profile: ClientProfile;
  capabilities: ClientCapabilities;
  handlers: ShortcutHandlers;
  isFeatureEnabledFn?: (flag: string) => boolean;
}

export function registerCatalogShortcuts(options: RegisterCatalogShortcutsOptions): void {
  const {
    shortcuts,
    profile,
    capabilities,
    handlers,
    isFeatureEnabledFn = isFeatureEnabled,
  } = options;

  for (const entry of listCatalogEntries(profile, capabilities, isFeatureEnabledFn)) {
    const action = handlers[entry.id];
    if (!action && !entry.helpOnly) continue;

    const registerBinding = (
      binding: ReturnType<typeof resolveProfileBinding>,
      helpOnly = entry.helpOnly ?? false,
    ) => {
      shortcuts.register(descriptorFromBinding(binding, {
        commandId: entry.id,
        description: entry.description,
        category: entry.category,
        allowInInput: entry.allowInInput,
        helpOnly,
      }, helpOnly || !action ? () => {} : action));
    };

    registerBinding(resolveProfileBinding(entry.binding, profile));

    if (entry.alternateBinding) {
      registerBinding(resolveProfileBinding(entry.alternateBinding, profile), false);
    }
  }
}
