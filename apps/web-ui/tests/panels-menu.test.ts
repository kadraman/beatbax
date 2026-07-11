import { buildPanelMenuEntries, type PanelMenuState } from '../src/ui/panels-menu';

jest.mock('@beatbax/app-core/client-profile', () => {
  const actual = jest.requireActual('@beatbax/app-core/client-profile');
  return {
    ...actual,
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
    expect(ids).toContain('song-visualizer');
    expect(ids).toContain('help');
    expect(ids).not.toContain('ai-assistant');
    expect(ids).not.toContain('channel-mixer');
    expect(ids).not.toContain('pattern-grid');
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
