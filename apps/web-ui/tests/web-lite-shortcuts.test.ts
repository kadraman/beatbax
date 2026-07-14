/**
 * Documents keyboard shortcuts that must not appear in web-lite Help.
 * Help lists ks.list() at runtime; this test guards the capability contract.
 */

import { getCapabilities } from '@beatbax/app-core/client-profile';

const WEB_LITE_EXCLUDED = [
  'f5',
  'f8',
  'ctrl+shift+s',
  'ctrl+alt+p',
  'alt+shift+i',
  'ctrl+,',
] as const;

/** Shortcut ids that web-lite should never register (desktop-only or unavailable). */
function webLiteExcludedShortcutIds(): readonly string[] {
  const caps = getCapabilities('web-lite');
  const excluded: string[] = [];

  if (!caps.nativeMenu) {
    excluded.push('f5', 'f8', 'ctrl+shift+s');
  }
  if (!caps.channelMixer) excluded.push('ctrl+shift+m');
  if (!caps.advancedEditor) excluded.push('ctrl+alt+p');
  if (!caps.copilot) excluded.push('alt+shift+i');
  if (!caps.settingsPanel) excluded.push('ctrl+,');

  return excluded;
}

describe('web-lite keyboard shortcut contract', () => {
  it('excludes desktop-only and unavailable shortcuts', () => {
    const excluded = webLiteExcludedShortcutIds();
    for (const id of WEB_LITE_EXCLUDED) {
      expect(excluded).toContain(id);
    }
  });

  it('web-lite disables settings (Ctrl+,) — theme/wrap use toolbar shortcuts', () => {
    const caps = getCapabilities('web-lite');
    expect(caps.settingsPanel).toBe(false);
    expect(caps.nativeMenu).toBe(false);
  });
});
