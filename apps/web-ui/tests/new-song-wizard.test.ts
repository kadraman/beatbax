import type { ChipPlugin } from '@beatbax/engine/chips';
import { buildNewSongWizard, claimNewSongWizardOnboarding } from '../src/panels/new-song-wizard';

function makeChip(id: string, overrides: Partial<ChipPlugin> = {}): ChipPlugin {
  return {
    name: id,
    version: '0.0.1',
    channels: 1,
    validateInstrument: () => [],
    createChannel: () => ({ reset() {}, noteOn() {}, noteOff() {}, applyEnvelope() {}, render() {} }),
    newSongWizard: {
      metadata: {
        chipDisplayName: id === 'nes' ? 'NES/Famicom (Ricoh 2A03)' : `${id.toUpperCase()} Chip`,
        platform: `${id} platform`,
        year: '1990',
        channelSummary: '1 channel',
        blurb: id === 'nes' ? 'Classic five-channel APU with DPCM samples.' : undefined,
        eraTag: '1990',
        styleTags: id === 'nes' ? ['console', '5-channel'] : undefined,
        channels: id === 'nes'
          ? [
              { name: 'Pulse1', role: 'lead' },
              { name: 'Noise', role: 'drums' },
            ]
          : undefined,
        highlights: id === 'nes'
          ? [
              { title: 'Duty-cycle swagger', detail: 'Skinny bites vs fat pads on the pulse leads.' },
              { title: 'Drop in real hits', detail: 'DPCM sneaks sampled kicks into the mix.' },
            ]
          : undefined,
      },
      templates: {
        instruments: [{ id: `${id}-inst`, label: `${id} instruments`, content: `inst lead type=${id}` }],
        effects: [{ id: `${id}-fx`, label: `${id} effects`, content: `effect fx = vib:2,4,sine,2` }],
        structure: [{ id: `${id}-struct`, label: `${id} structure`, content: 'pat a = C4\nseq main = a\nchannel 1 => inst lead seq main\nplay' }],
        defaults: {
          instruments: `${id}-inst`,
          effects: `${id}-fx`,
          structure: `${id}-struct`,
        },
      },
    },
    ...overrides,
  };
}

function getWizardElements() {
  return {
    chipName: () => document.querySelector<HTMLElement>('.bb-new-song-wizard__chip-name')!,
    chipMeta: () => document.querySelector<HTMLElement>('.bb-new-song-wizard__chip-meta')!,
    chipPagination: () => document.querySelector<HTMLElement>('.bb-new-song-wizard__chip-pagination')!,
    chipPrevBtn: () => document.querySelector<HTMLButtonElement>('.bb-new-song-wizard__chip-nav--prev')!,
    chipNextBtn: () => document.querySelector<HTMLButtonElement>('.bb-new-song-wizard__chip-nav--next')!,
    artist: () => document.querySelector<HTMLInputElement>('.bb-new-song-wizard__field input[type="text"]:not([placeholder])')!,
    bpm: () => document.querySelector<HTMLInputElement>('input[type="number"]')!,
    songName: () => document.querySelector<HTMLInputElement>('input[placeholder="Untitled song"]')!,
    tags: () => document.querySelector<HTMLInputElement>('input[placeholder="demo, upbeat"]')!,
    desc: () => document.querySelector<HTMLTextAreaElement>('textarea')!,
    exampleToggles: () => Array.from(document.querySelectorAll<HTMLInputElement>('.bb-new-song-wizard__toggle input[type="checkbox"]')),
    createBtn: () => Array.from(document.querySelectorAll<HTMLButtonElement>('.bb-new-song-wizard__btn')).find((b) => b.textContent?.includes('Create'))!,
    cancelBtn: () => Array.from(document.querySelectorAll<HTMLButtonElement>('.bb-new-song-wizard__btn')).find((b) => b.textContent?.includes('Cancel'))!,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('New Song Wizard', () => {
  it('shows only enabled chips and applies default artist/bpm on open', () => {
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'nes', plugin: makeChip('nes') }],
      getDefaultBpm: () => 142,
      getDefaultArtist: () => 'Default Artist',
      onCreate: jest.fn(),
    });
    wizard.open();
    const el = getWizardElements();
    expect(el.chipName().textContent).toContain('NES/Famicom');
    expect(el.chipPagination().textContent).toContain('1 / 1');
    expect(el.chipPrevBtn().disabled).toBe(true);
    expect(el.chipNextBtn().disabled).toBe(true);
    expect(el.artist().value).toBe('Default Artist');
    expect(el.bpm().value).toBe('142');
    // Rich optional metadata renders when provided
    expect(el.chipMeta().textContent).toContain('Classic five-channel APU');
    expect(el.chipMeta().textContent).toContain('Pulse1');
    expect(document.querySelector('.bb-new-song-wizard__chip-tips-title')?.textContent).toContain('Why');
    expect(document.querySelector('.bb-new-song-wizard__chip-highlight-title')?.textContent).toBe('Duty-cycle swagger');
    expect(document.querySelector('.bb-new-song-wizard__chip-tips')?.textContent).toContain('Drop in real hits');
    expect(document.querySelector('.bb-new-song-wizard__chip-card > .bb-new-song-wizard__chip-tips')).toBeTruthy();
    expect(document.querySelector('.bb-new-song-wizard__chip-visual .bb-new-song-wizard__chip-tips')).toBeNull();
    expect(document.querySelector('.bb-new-song-wizard__chip-tag--era')?.textContent).toBe('1990');
    expect(document.querySelector('.bb-settings-badge')?.textContent).toBe('Stable');
    expect(document.querySelector('.bb-new-song-wizard__chip-hint')?.textContent).toContain('switch chips');
    expect(document.body.textContent).not.toContain('Sound chip');
    // Preview hidden unless onPreview is provided
    expect(document.querySelector<HTMLButtonElement>('.bb-new-song-wizard__chip-preview')?.hidden).toBe(true);
  });

  it('previews starter-kit source and stops on toggle / chip change', () => {
    const onPreview = jest.fn();
    const onStopPreview = jest.fn();
    const nes = makeChip('nes');
    const sms = makeChip('sms');
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'nes', plugin: nes }, { id: 'sms', plugin: sms }],
      getDefaultBpm: () => 120,
      getDefaultArtist: () => '',
      onCreate: jest.fn(),
      onPreview,
      onStopPreview,
    });
    wizard.open();
    const previewBtn = document.querySelector<HTMLButtonElement>('.bb-new-song-wizard__chip-preview')!;
    expect(previewBtn.hidden).toBe(false);
    expect(previewBtn.textContent).toContain('Preview');
    expect(previewBtn.querySelector('svg')).toBeTruthy();

    previewBtn.click();
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0][0]).toContain('chip nes');
    expect(onPreview.mock.calls[0][0]).toContain('inst lead type=nes');
    expect(typeof onPreview.mock.calls[0][1]?.onEnded).toBe('function');
    expect(previewBtn.textContent).toContain('Stop');

    // Natural end resets the button without an explicit Stop click
    onPreview.mock.calls[0][1].onEnded();
    expect(previewBtn.textContent).toContain('Preview');
    expect(onStopPreview).not.toHaveBeenCalled();

    previewBtn.click();
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(previewBtn.textContent).toContain('Stop');

    previewBtn.click();
    expect(onStopPreview).toHaveBeenCalledTimes(1);
    expect(previewBtn.textContent).toContain('Preview');

    previewBtn.click();
    expect(onPreview).toHaveBeenCalledTimes(3);
    document.querySelector<HTMLButtonElement>('.bb-new-song-wizard__chip-nav--next')!.click();
    expect(onStopPreview).toHaveBeenCalledTimes(2);
    expect(previewBtn.textContent).toContain('Preview');
  });

  it('falls back to channelSummary when rich metadata is absent', () => {
    const plain = makeChip('sms', {
      newSongWizard: {
        metadata: {
          chipDisplayName: 'SMS Chip',
          platform: 'Sega Master System',
          year: '1985',
          channelSummary: '3 tone, 1 noise',
        },
        templates: {
          instruments: [{ id: 'sms-i', label: 'SMS Inst', content: 'inst lead type=tone1' }],
          effects: [{ id: 'sms-e', label: 'SMS FX', content: 'effect fx = volSlide:-5' }],
          structure: [{ id: 'sms-s', label: 'SMS Struct', content: 'pat a = C4\nseq main = a\nchannel 1 => inst lead seq main\nplay' }],
          defaults: { instruments: 'sms-i', effects: 'sms-e', structure: 'sms-s' },
        },
      },
    });
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'sms', plugin: plain }],
      getDefaultBpm: () => 128,
      getDefaultArtist: () => '',
      onCreate: jest.fn(),
    });
    wizard.open();
    const el = getWizardElements();
    expect(el.chipMeta().textContent).toContain('Sega Master System');
    expect(el.chipMeta().textContent).toContain('3 tone, 1 noise');
    expect(el.chipMeta().querySelector('.bb-new-song-wizard__chip-channels')).toBeNull();
    expect(el.chipMeta().querySelector('.bb-new-song-wizard__chip-blurb')).toBeNull();
  });

  it('updates chip summary and plugin-backed example content when chip changes', () => {
    const onCreate = jest.fn();
    const nes = makeChip('nes');
    const sms = makeChip('sms', {
      newSongWizard: {
        metadata: {
          chipDisplayName: 'SMS Chip',
          platform: 'Sega Master System',
          year: '1985',
          channelSummary: '3 tone, 1 noise',
        },
        templates: {
          instruments: [{ id: 'sms-i', label: 'SMS Inst', content: 'inst lead type=tone1' }],
          effects: [{ id: 'sms-e', label: 'SMS FX', content: 'effect fx = volSlide:-5' }],
          structure: [{ id: 'sms-s', label: 'SMS Struct', content: 'pat a = C4\nseq main = a\nchannel 1 => inst lead seq main\nplay' }],
          defaults: { instruments: 'sms-i', effects: 'sms-e', structure: 'sms-s' },
        },
      },
    });
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'nes', plugin: nes }, { id: 'sms', plugin: sms }],
      getDefaultBpm: () => 128,
      getDefaultArtist: () => '',
      onCreate,
    });
    wizard.open();
    const el = getWizardElements();
    el.chipNextBtn().click();
    expect(el.chipName().textContent).toContain('SMS Chip');
    expect(el.chipMeta().textContent).toContain('Sega Master System');

    const [instToggle] = el.exampleToggles();
    expect(instToggle.checked).toBe(true);

    el.songName().value = 'SMS Tune';
    el.createBtn().click();
    const payload = onCreate.mock.calls[0][0];
    expect(payload.source).toContain('inst lead type=tone1');
    expect(payload.source).not.toContain('inst lead type=nes');
  });

  it('supports keyboard left/right navigation for chips', () => {
    const nes = makeChip('nes');
    const sms = makeChip('sms');
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'nes', plugin: nes }, { id: 'sms', plugin: sms }],
      getDefaultBpm: () => 128,
      getDefaultArtist: () => '',
      onCreate: jest.fn(),
    });
    wizard.open();

    const backdrop = document.querySelector<HTMLElement>('.bb-new-song-wizard-backdrop')!;
    const el = getWizardElements();
    expect(el.chipName().textContent).toContain('NES/Famicom');

    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(el.chipName().textContent).toContain('SMS Chip');

    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(el.chipName().textContent).toContain('NES/Famicom');
  });

  it('creates song source from selected wizard values and closes on cancel', () => {
    const onCreate = jest.fn();
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'nes', plugin: makeChip('nes') }],
      getDefaultBpm: () => 120,
      getDefaultArtist: () => '',
      onCreate,
    });
    wizard.open();
    const el = getWizardElements();
    el.songName().value = 'My Tune';
    el.artist().value = 'Artist';
    el.tags().value = 'demo, test';
    el.desc().value = 'A wizard-generated song';
    const [, effectsToggle] = el.exampleToggles();
    effectsToggle.checked = false;
    el.createBtn().click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    const payload = onCreate.mock.calls[0][0];
    expect(payload.songName).toBe('My Tune');
    expect(payload.source).toContain('chip nes');
    expect(payload.source).toContain('song name "My Tune"');
    expect(payload.source).toContain('song artist "Artist"');
    expect(payload.source).toContain('song tags "demo, test"');
    expect(payload.source).toContain('inst lead type=nes');
    expect(payload.source).not.toContain('effect fx = vib:2,4,sine,2');
    expect(payload.source).toContain('channel 1 => inst lead seq main');

    wizard.open();
    const backdrop = document.querySelector<HTMLElement>('.bb-new-song-wizard-backdrop')!;
    expect(backdrop.classList.contains('bb-new-song-wizard-backdrop--open')).toBe(true);
    getWizardElements().cancelBtn().click();
    expect(backdrop.classList.contains('bb-new-song-wizard-backdrop--open')).toBe(false);
  });
});

describe('claimNewSongWizardOnboarding', () => {
  it('returns true and writes flag once, then false on subsequent calls', () => {
    const map = new Map<string, string>();
    const key = 'wizard.onboarded';
    const first = claimNewSongWizardOnboarding(
      (k) => map.get(k),
      (k, v) => map.set(k, v),
      key,
    );
    const second = claimNewSongWizardOnboarding(
      (k) => map.get(k),
      (k, v) => map.set(k, v),
      key,
    );
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(map.get(key)).toBe('true');
  });
});
