import {
  getEffectiveAutoSaveDelay,
  settingAutoSave,
  settingAutoSaveDelay,
} from '../src/stores/settings.store';

beforeEach(() => {
  localStorage.clear();
  settingAutoSave.set(true);
  settingAutoSaveDelay.set(1000);
});

describe('getEffectiveAutoSaveDelay', () => {
  it('returns 0 when auto-save is disabled', () => {
    settingAutoSave.set(false);
    settingAutoSaveDelay.set(750);
    expect(getEffectiveAutoSaveDelay()).toBe(0);
  });

  it('returns configured delay when auto-save is enabled', () => {
    settingAutoSave.set(true);
    settingAutoSaveDelay.set(750);
    expect(getEffectiveAutoSaveDelay()).toBe(750);
  });

  it('defaults to 1000 ms when no delay is stored', () => {
    settingAutoSave.set(true);
    expect(getEffectiveAutoSaveDelay()).toBe(1000);
  });
});
