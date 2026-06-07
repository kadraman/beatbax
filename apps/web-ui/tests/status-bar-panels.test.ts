import { StatusBar } from '../src/ui/status-bar';
import type { PanelMenuId, PanelMenuState } from '../src/ui/panels-menu';
import { validationErrors, validationWarnings } from '@beatbax/app-core/stores/editor.store';

describe('StatusBar panels menu', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    validationErrors.set([]);
    validationWarnings.set([]);
  });

  it('shows error and warning counts on the left at all times', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    new StatusBar({
      container: host,
      getPanelMenuState: () => ({
        outputOpen: true,
        problemsOpen: true,
        outputPaneVisible: true,
        channelsOpen: true,
        helpOpen: true,
        rightPaneVisible: true,
        toolbarVisible: true,
        transportVisible: true,
        channelMixerVisible: false,
        patternGridVisible: false,
        aiOpen: false,
      }),
      onPanelMenuToggle: jest.fn(),
      onShowProblems: jest.fn(),
    });

    const bar = host.querySelector('.status-bar')!;
    expect(bar.firstElementChild?.querySelector('.status-label')?.textContent).toMatch(/^Chip:/);

    const diagnostics = host.querySelector('.status-diagnostics');
    const errorBtn = host.querySelector<HTMLButtonElement>('.status-errors');
    const warningBtn = host.querySelector<HTMLButtonElement>('.status-warnings');
    expect(diagnostics?.firstElementChild).toBe(errorBtn);
    expect(errorBtn?.hidden).toBe(false);
    expect(warningBtn?.hidden).toBe(false);
    expect(errorBtn?.querySelector('.status-count')?.textContent).toBe('0');
    expect(warningBtn?.querySelector('.status-count')?.textContent).toBe('0');
    expect(host.querySelector('.status-brand')).toBeNull();
  });

  it('opens Problems when error count is clicked', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let showProblems = false;
    const state: PanelMenuState = {
      outputOpen: true,
      problemsOpen: true,
      outputPaneVisible: true,
      channelsOpen: true,
      helpOpen: true,
      rightPaneVisible: true,
      toolbarVisible: true,
      transportVisible: true,
      channelMixerVisible: false,
      patternGridVisible: false,
      aiOpen: false,
    };

    new StatusBar({
      container: host,
      getPanelMenuState: () => state,
      onPanelMenuToggle: jest.fn(),
      onShowProblems: () => { showProblems = true; },
    });

    validationErrors.set([{ message: 'bad', line: 1, column: 1 }] as any);

    const errorBtn = host.querySelector<HTMLButtonElement>('.status-errors');
    expect(errorBtn?.hidden).toBe(false);
    errorBtn?.click();
    expect(showProblems).toBe(true);
  });

  it('toggles a panel from the Panels dropdown', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const toggled: PanelMenuId[] = [];
    const state: PanelMenuState = {
      outputOpen: false,
      problemsOpen: true,
      outputPaneVisible: true,
      channelsOpen: true,
      helpOpen: true,
      rightPaneVisible: true,
      toolbarVisible: true,
      transportVisible: true,
      channelMixerVisible: false,
      patternGridVisible: false,
      aiOpen: false,
    };

    new StatusBar({
      container: host,
      getPanelMenuState: () => state,
      onPanelMenuToggle: (id) => toggled.push(id),
      onShowProblems: jest.fn(),
    });

    const panelsBtn = host.querySelector<HTMLButtonElement>('.status-panels-btn');
    panelsBtn?.click();

    const outputItem = host.querySelector<HTMLElement>('[data-panel-id="output"]');
    expect(outputItem).not.toBeNull();
    outputItem?.click();
    expect(toggled).toEqual(['output']);
  });
});
