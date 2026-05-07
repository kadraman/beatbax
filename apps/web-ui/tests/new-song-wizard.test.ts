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
        chipDisplayName: `${id.toUpperCase()} Chip`,
        platform: `${id} platform`,
        year: '1990',
        channelSummary: '1 channel',
      },
      templates: {
        instruments: [{ id: `${id}-inst`, label: `${id} instruments`, content: `inst lead type=${id}` }],
        namedEffects: [{ id: `${id}-fx`, label: `${id} effects`, content: `effect fx = vib:2,4,sine,2` }],
        structure: [{ id: `${id}-struct`, label: `${id} structure`, content: 'pat a = C4\nseq main = a\nchannel 1 => inst lead seq main\nplay' }],
        defaults: {
          instruments: `${id}-inst`,
          namedEffects: `${id}-fx`,
          structure: `${id}-struct`,
        },
      },
    },
    ...overrides,
  };
}

function getWizardElements() {
  return {
    chipRows: () => Array.from(document.querySelectorAll<HTMLElement>('.bb-new-song-wizard__chip-row')),
    summaryMeta: () => document.querySelector<HTMLElement>('.bb-new-song-wizard__summary-meta')!,
    artist: () => document.querySelector<HTMLInputElement>('.bb-new-song-wizard__field input[type="text"]:not([placeholder])')!,
    bpm: () => document.querySelector<HTMLInputElement>('input[type="number"]')!,
    songName: () => document.querySelector<HTMLInputElement>('input[placeholder="Untitled song"]')!,
    tags: () => document.querySelector<HTMLInputElement>('input[placeholder="demo, upbeat"]')!,
    desc: () => document.querySelector<HTMLTextAreaElement>('textarea')!,
    selects: () => Array.from(document.querySelectorAll<HTMLSelectElement>('.bb-new-song-wizard__select')),
    createBtn: () => Array.from(document.querySelectorAll<HTMLButtonElement>('.bb-new-song-wizard__btn')).find((b) => b.textContent?.includes('Create'))!,
    openExistingBtn: () => Array.from(document.querySelectorAll<HTMLButtonElement>('.bb-new-song-wizard__btn')).find((b) => b.textContent?.includes('Open Existing'))!,
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
      onOpenExisting: jest.fn(),
    });
    wizard.open();
    const el = getWizardElements();
    expect(el.chipRows()).toHaveLength(1);
    expect(el.chipRows()[0].textContent).toContain('NES Chip');
    expect(el.artist().value).toBe('Default Artist');
    expect(el.bpm().value).toBe('142');
  });

  it('updates chip summary and template selectors when chip changes', () => {
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
          namedEffects: [{ id: 'sms-e', label: 'SMS FX', content: 'effect fx = volSlide:-5' }],
          structure: [{ id: 'sms-s', label: 'SMS Struct', content: 'pat a = C4\nseq main = a\nchannel 1 => inst lead seq main\nplay' }],
          defaults: { instruments: 'sms-i', namedEffects: 'sms-e', structure: 'sms-s' },
        },
      },
    });
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'nes', plugin: nes }, { id: 'sms', plugin: sms }],
      getDefaultBpm: () => 128,
      getDefaultArtist: () => '',
      onCreate: jest.fn(),
      onOpenExisting: jest.fn(),
    });
    wizard.open();
    const radio = document.querySelector<HTMLInputElement>('input[value="sms"]')!;
    radio.click();
    const el = getWizardElements();
    expect(el.summaryMeta().textContent).toContain('Sega Master System');
    const [instSel] = el.selects();
    expect(Array.from(instSel.options).map((o) => o.textContent)).toContain('SMS Inst');
  });

  it('creates song source from selected wizard values and supports open-existing flow', () => {
    const onCreate = jest.fn();
    const onOpenExisting = jest.fn();
    const wizard = buildNewSongWizard({
      getEnabledChips: () => [{ id: 'nes', plugin: makeChip('nes') }],
      getDefaultBpm: () => 120,
      getDefaultArtist: () => '',
      onCreate,
      onOpenExisting,
    });
    wizard.open();
    const el = getWizardElements();
    el.songName().value = 'My Tune';
    el.artist().value = 'Artist';
    el.tags().value = 'demo, test';
    el.desc().value = 'A wizard-generated song';
    el.createBtn().click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    const payload = onCreate.mock.calls[0][0];
    expect(payload.songName).toBe('My Tune');
    expect(payload.source).toContain('chip nes');
    expect(payload.source).toContain('song name "My Tune"');
    expect(payload.source).toContain('song artist "Artist"');
    expect(payload.source).toContain('song tags "demo, test"');
    expect(payload.source).toContain('inst lead type=nes');
    expect(payload.source).toContain('effect fx = vib:2,4,sine,2');
    expect(payload.source).toContain('channel 1 => inst lead seq main');

    wizard.open();
    getWizardElements().openExistingBtn().click();
    expect(onOpenExisting).toHaveBeenCalledTimes(1);
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
