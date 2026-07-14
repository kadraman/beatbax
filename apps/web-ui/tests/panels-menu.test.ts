import { buildPanelMenuEntries, type PanelMenuState } from '../src/ui/panels-menu';

jest.mock('@beatbax/app-core/client-profile', () => {
  const actual = jest.requireActual('@beatbax/app-core/client-profile');
  return {
    ...actual,
    getClientProfile: () => 'web-lite',
    getCurrentCapabilities: () => actual.getCapabilities('web-lite'),
  };
});

describe('panels-menu', () => {
  const baseState: PanelMenuState = {
    outputOpen: true,
    problemsOpen: true,
    outputPaneVisible: true,
    channelsOpen: true,
    helpOpen: false,
    rightPaneVisible: true,
    toolbarVisible: true,
    transportVisible: true,
    channelMixerVisible: false,
    patternGridVisible: false,
  };

  it('includes web-lite bottom and side panels', () => {
    const entries = buildPanelMenuEntries(baseState);
    const ids = entries.map(e => e.id);
    expect(ids).toContain('output');
    expect(ids).toContain('problems');
    expect(ids).toContain('help');
    expect(ids).toContain('channel-mixer');
    expect(ids).toContain('toolbar');
    expect(ids).toContain('transport-bar');
    expect(ids).not.toContain('song-visualizer');
    expect(ids).not.toContain('ai-assistant');
    expect(ids).not.toContain('pattern-grid');
  });

  it('uses browser-safe toolbar and transport shortcuts on web-lite', () => {
    const entries = buildPanelMenuEntries(baseState);
    expect(entries.find(e => e.id === 'toolbar')?.shortcut).toBe('Alt+Shift+B');
    expect(entries.find(e => e.id === 'transport-bar')?.shortcut).toBe('Alt+Shift+R');
  });

  it('marks panels unchecked when pane is collapsed', () => {
    const entries = buildPanelMenuEntries({
      ...baseState,
      outputOpen: true,
      outputPaneVisible: false,
    });
    expect(entries.find(e => e.id === 'output')?.checked).toBe(false);
  });
});
