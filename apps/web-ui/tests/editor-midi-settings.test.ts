import { buildEditorSection } from '../src/panels/settings-sections/editor';
import { settingMidiInputDevice } from '../src/stores/settings.store';

describe('Editor MIDI settings', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    delete (window as any).__beatbax_midiStepEntry;
    jest.clearAllMocks();
  });

  it('adds spacing between MIDI settings entries', () => {
    const section = buildEditorSection();
    const midiContainer = section.querySelector<HTMLElement>('#bb-midi-settings-container');

    expect(midiContainer).toBeTruthy();
    expect(midiContainer?.style.display).toBe('none');
    expect(midiContainer?.style.flexDirection).toBe('column');
    expect(midiContainer?.style.gap).toBe('12px');
  });

  it('keeps flex spacing layout when MIDI input is enabled from the toggle', () => {
    const section = buildEditorSection();
    const midiContainer = section.querySelector<HTMLElement>('#bb-midi-settings-container');
    expect(midiContainer).toBeTruthy();

    const rows = Array.from(section.querySelectorAll<HTMLElement>('.bb-settings-toggle-row'));
    const midiEnableRow = rows.find((row) =>
      row.querySelector('.bb-settings-label')?.textContent?.trim() === 'Enable MIDI input'
    );
    const midiEnableInput = midiEnableRow?.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(midiEnableInput).toBeTruthy();
    midiEnableInput!.checked = true;
    midiEnableInput!.dispatchEvent(new Event('change'));

    expect(midiContainer!.style.display).toBe('flex');
    expect(midiContainer!.style.flexDirection).toBe('column');
    expect(midiContainer!.style.gap).toBe('12px');
  });

  it('refreshes the MIDI device list after requesting access', async () => {
    let devices: Array<{ id: string; name: string }> = [];
    const requestMidiAccess = jest.fn(async () => {
      devices = [{ id: 'kbd-1', name: 'Keyboard One' }];
    });

    (window as any).__beatbax_midiStepEntry = {
      requestMidiAccess,
      listDevices: () => devices,
      setDeviceById: jest.fn(),
    };

    const section = buildEditorSection();
    document.body.appendChild(section);

    await Promise.resolve();
    await Promise.resolve();

    expect(requestMidiAccess).toHaveBeenCalled();

    const select = section.querySelector<HTMLSelectElement>('#bb-midi-device-select');
    expect(select).toBeTruthy();
    expect(Array.from(select!.options).map((opt) => opt.textContent)).toContain('Keyboard One');
    expect(select!.options[0].textContent).toBe('— Select a device —');
  });

  it('does not auto-select from controller state when no device is selected in settings', async () => {
    const requestMidiAccess = jest.fn(async () => {});

    (window as any).__beatbax_midiStepEntry = {
      requestMidiAccess,
      listDevices: () => [{ id: 'kbd-2', name: 'Keyboard Two' }],
      setDeviceById: jest.fn(),
    };

    const section = buildEditorSection();
    document.body.appendChild(section);

    await Promise.resolve();
    await Promise.resolve();

    const select = section.querySelector<HTMLSelectElement>('#bb-midi-device-select');
    expect(select).toBeTruthy();
    expect(select!.value).toBe('');
    expect(select!.options[0].selected).toBe(true);
  });

  it('clears stale saved device ids that are not in the refreshed device list', async () => {
    settingMidiInputDevice.set('stale-device-id');

    (window as any).__beatbax_midiStepEntry = {
      requestMidiAccess: jest.fn(async () => {}),
      listDevices: () => [{ id: 'kbd-3', name: 'Keyboard Three' }],
      setDeviceById: jest.fn(),
    };

    const section = buildEditorSection();
    document.body.appendChild(section);

    await Promise.resolve();
    await Promise.resolve();

    const select = section.querySelector<HTMLSelectElement>('#bb-midi-device-select');
    expect(select).toBeTruthy();
    expect(select!.value).toBe('');
    expect(settingMidiInputDevice.get()).toBe('');
  });
});
