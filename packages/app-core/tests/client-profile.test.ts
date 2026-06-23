import { getCapabilities, getClientProfile } from '../src/client-profile';

describe('client-profile', () => {
  it('defaults to desktop-full capabilities when profile unset', () => {
    const caps = getCapabilities(getClientProfile());
    expect(caps.export).toBe(true);
    expect(caps.copilot).toBe(true);
    expect(caps.advancedEditor).toBe(true);
  });

  it('web-lite disables desktop-only full IDE features', () => {
    const caps = getCapabilities('web-lite');
    expect(caps.export).toBe(false);
    expect(caps.copilot).toBe(false);
    expect(caps.channelMixer).toBe(true);
    expect(caps.songVisualizer).toBe(false);
    expect(caps.patternGrid).toBe(false);
    expect(caps.advancedEditor).toBe(false);
    expect(caps.midiStepEntry).toBe(false);
    expect(caps.helpPanel).toBe(true);
    expect(caps.outputPanel).toBe(true);
    expect(caps.problemsPanel).toBe(true);
    expect(caps.settingsPanel).toBe(false);
    expect(caps.exampleMenu).toBe(true);
  });

  it('desktop-full disables remote example menus', () => {
    const caps = getCapabilities('desktop-full');
    expect(caps.exampleMenu).toBe(false);
    expect(caps.songVisualizer).toBe(true);
    expect(caps.nativeMenu).toBe(true);
  });
});
