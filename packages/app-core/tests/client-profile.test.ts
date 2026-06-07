import { getCapabilities, getClientProfile } from '../src/client-profile';

describe('client-profile', () => {
  it('defaults to desktop-full capabilities when profile unset', () => {
    const caps = getCapabilities(getClientProfile());
    expect(caps.export).toBe(true);
    expect(caps.copilot).toBe(true);
    expect(caps.advancedEditor).toBe(true);
  });

  it('web-lite disables full IDE features', () => {
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
    expect(caps.settingsPanel).toBe(false);
  });
});
