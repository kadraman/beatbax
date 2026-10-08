import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { chatSettings, updateChatSettings } from '@beatbax/app-core/stores/chat.store';
import { AdvancedRequestControls } from '../src/renderer/src/components/settings/ai';
import { useStoreValue } from '../src/renderer/src/hooks/useStoreValue';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness(): React.JSX.Element {
  return createElement(AdvancedRequestControls, { settings: useStoreValue(chatSettings) });
}

describe('Settings → AI → Advanced: Reset to Auto', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    updateChatSettings({ reasoningEffort: 'auto', reasoningEffortCustom: undefined });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(Harness)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const select = (): HTMLSelectElement => container.querySelector('#bb-ai-reasoning-effort') as HTMLSelectElement;
  const customInput = (): HTMLInputElement | null => container.querySelector('#bb-ai-reasoning-custom');
  const resetButton = (): HTMLButtonElement => Array.from(container.querySelectorAll('button'))
    .find((el) => el.textContent?.trim() === 'Reset to Auto') as HTMLButtonElement;

  it('clears a pending Custom selection with an invalid draft', async () => {
    await act(async () => {
      select().value = 'custom';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    const input = customInput() as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Not Valid!');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.blur();
    });
    expect(select().value).toBe('custom');
    expect(container.textContent).toContain('Use 1–32 lowercase letters');
    expect(chatSettings.get().reasoningEffort).toBe('auto');

    await act(async () => resetButton().click());

    expect(chatSettings.get().reasoningEffort).toBe('auto');
    expect(select().value).toBe('auto');
    expect(customInput()).toBeNull();
    expect(container.textContent).not.toContain('Use 1–32 lowercase letters');
  });
});
