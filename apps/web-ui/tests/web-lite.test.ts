jest.mock('@beatbax/app-core/client-profile', () => {
  const actual = jest.requireActual('@beatbax/app-core/client-profile');
  return {
    ...actual,
    getClientProfile: () => 'web-lite',
    getCurrentCapabilities: () => actual.getCapabilities('web-lite'),
  };
});

import { getCapabilities } from '@beatbax/app-core/client-profile';
import { buildAppLayout } from '../src/app/layout';
import { buildBottomTabs, buildRightTabs } from '../src/app/tabs';
import { Toolbar } from '../src/ui/toolbar';

describe('web-lite profile', () => {
  it('web-lite disables full IDE features but keeps help and output', () => {
    const caps = getCapabilities('web-lite');
    expect(caps.export).toBe(false);
    expect(caps.copilot).toBe(false);
    expect(caps.channelMixer).toBe(false);
    expect(caps.patternGrid).toBe(false);
    expect(caps.advancedEditor).toBe(false);
    expect(caps.midiStepEntry).toBe(false);
    expect(caps.helpPanel).toBe(true);
    expect(caps.outputPanel).toBe(true);
    expect(caps.problemsPanel).toBe(true);
  });

  it('buildAppLayout adds web-lite header with text logo and social links', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = document.getElementById('app')!;
    buildAppLayout(app);
    expect(document.getElementById('bb-web-lite-header')).not.toBeNull();
    expect(document.querySelector('.bb-web-lite-header__logo')?.textContent).toBe('BeatBax');
    expect(document.querySelector('.bb-web-lite-header__cta')).toBeNull();
    const github = document.querySelector('.bb-web-lite-header__social-link[data-social="github"]');
    expect(github).not.toBeNull();
    expect(github?.getAttribute('href')).toContain('github.com/kadraman/beatbax');
    expect(document.querySelectorAll('.bb-web-lite-header__social-link')).toHaveLength(1);
  });

  it('bottom tabs include Output in web-lite', () => {
    const outputPane = document.createElement('div');
    const layout = {
      setOutputPaneVisible: jest.fn(),
      setRightPaneVisible: jest.fn(),
      getRightPaneExpandStrip: () => document.createElement('div'),
      getOutputPaneExpandStrip: () => document.createElement('div'),
      isOutputPaneVisible: () => true,
    } as any;
    const bottom = buildBottomTabs(outputPane, layout);
    expect(bottom.tabButtons.output).toBeDefined();
    expect(bottom.tabButtons.problems).toBeDefined();
  });

  it('right tabs show Visualizer and Help in web-lite', () => {
    const rightPane = document.createElement('div');
    const layout = {
      setOutputPaneVisible: jest.fn(),
      setRightPaneVisible: jest.fn(),
      getRightPaneExpandStrip: () => document.createElement('div'),
    } as any;
    const right = buildRightTabs(rightPane, layout);
    expect(right.tabButtons.channels).toBeDefined();
    expect(right.tabButtons.help).toBeDefined();
    expect(right.tabButtons.ai).toBeUndefined();
  });

  it('toolbar renders Save and Verify without export group', () => {
    const container = document.createElement('div');
    const eventBus = { on: jest.fn(), emit: jest.fn() } as any;
    new Toolbar({
      container,
      eventBus,
      onLoad: jest.fn(),
      onExport: jest.fn(),
      onSave: jest.fn(),
    });
    expect(container.querySelector('#tb-save')).not.toBeNull();
    expect(container.querySelector('#tb-verify')).not.toBeNull();
    expect(container.querySelector('#tb-new')).not.toBeNull();
    expect(container.querySelector('#tb-export-group')).toBeNull();
    expect(container.querySelector('#tb-open')).not.toBeNull();
  });
});
