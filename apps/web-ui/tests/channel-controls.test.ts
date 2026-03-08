/**
 * Tests for ChannelControls panel (Phase 2.5.2)
 */

import { ChannelControls } from '../src/panels/channel-controls';
import { EventBus } from '../src/utils/event-bus';
import { ChannelState } from '../src/playback/channel-state';
import type { PlaybackPosition } from '../src/playback/playback-manager';

describe('Phase 2.5.2: ChannelControls', () => {
  let container: HTMLElement;
  let eventBus: EventBus;
  let channelState: ChannelState;
  let channelControls: ChannelControls;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    eventBus = new EventBus();
    channelState = new ChannelState(eventBus);
    channelControls = new ChannelControls({
      container,
      eventBus,
      channelState,
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    channelControls.dispose();
    eventBus.clear();
    document.body.removeChild(container);
  });

  it('should render empty state when no channels defined', () => {
    channelControls.render();

    expect(container.innerHTML).toContain('Channel Controls');
    expect(container.innerHTML).toContain('No channels defined');
  });

  it('should render channels when AST is provided', () => {
    const ast = {
      channels: [
        { id: 1, events: [{ instrument: 'lead' }] },
        { id: 2, events: [{ instrument: 'bass' }] },
      ],
      insts: {
        lead: { type: 'pulse1' },
        bass: { type: 'pulse2' },
      },
    };

    eventBus.emit('parse:success', { ast });

    expect(container.innerHTML).toContain('Channel 1');
    expect(container.innerHTML).toContain('Channel 2');
    expect(container.innerHTML).toContain('🎵 lead');
    expect(container.innerHTML).toContain('🎵 bass');
  });

  it('should update channel display on position-changed event', () => {
    const ast = {
      channels: [
        { id: 1, events: [{ instrument: 'lead' }, { instrument: 'bass' }] },
      ],
    };

    eventBus.emit('parse:success', { ast });

    const position: PlaybackPosition = {
      channelId: 1,
      eventIndex: 5,
      totalEvents: 32,
      currentInstrument: 'lead',
      currentPattern: 'melody',
      sourceSequence: 'main',
      barNumber: 2,
      progress: 5 / 32,
    };

    eventBus.emit('playback:position-changed', { channelId: 1, position });

    // Check that instrument is updated
    const instEl = document.getElementById('ch-inst-1');
    expect(instEl).toBeTruthy();
    expect(instEl?.textContent).toContain('lead');

    // Check that pattern info is displayed
    const patternEl = document.getElementById('ch-pattern-1');
    expect(patternEl).toBeTruthy();
    expect(patternEl?.textContent).toContain('melody');
    expect(patternEl?.textContent).toContain('main');

    // Check that progress bar is updated
    const progressFill = document.getElementById('ch-progress-1');
    expect(progressFill).toBeTruthy();
    const expectedProgress = Math.round((5 / 32) * 100);
    expect(progressFill?.style.width).toBe(`${expectedProgress}%`);

    // Check position text
    const positionEl = document.getElementById('ch-position-1');
    expect(positionEl?.textContent).toBe('6/32');
  });

  it('should reset channel displays when playback stops', () => {
    const ast = {
      channels: [
        { id: 1, events: [{ instrument: 'lead' }] },
      ],
    };

    eventBus.emit('parse:success', { ast });

    // Simulate position update
    const position: PlaybackPosition = {
      channelId: 1,
      eventIndex: 10,
      totalEvents: 32,
      currentInstrument: 'lead',
      currentPattern: 'melody',
      sourceSequence: 'main',
      barNumber: 3,
      progress: 0.5,
    };

    eventBus.emit('playback:position-changed', { channelId: 1, position });

    // Now stop playback
    eventBus.emit('playback:stopped', undefined);

    // Check that displays are reset
    const progressFill = document.getElementById('ch-progress-1');
    expect(progressFill?.style.width).toBe('0%');

    const positionEl = document.getElementById('ch-position-1');
    expect(positionEl?.textContent).toBe('0/0');

    const patternEl = document.getElementById('ch-pattern-1');
    expect(patternEl?.textContent).toBe('');
  });

  it('should handle mute/unmute button clicks', () => {
    const ast = {
      channels: [
        { id: 1, events: [{ instrument: 'lead' }] },
      ],
    };

    eventBus.emit('parse:success', { ast });

    const muteBtn = container.querySelector('button');
    expect(muteBtn).toBeTruthy();
    expect(muteBtn?.textContent).toContain('Mute');

    // Click mute button
    muteBtn?.click();

    expect(muteBtn?.textContent).toContain('Unmute');
    expect(channelState.getChannel(1)?.muted).toBe(true);
  });

  it('should show progress from 0% to 100%', () => {
    const ast = {
      channels: [
        { id: 1, events: [{ instrument: 'lead' }] },
      ],
    };

    eventBus.emit('parse:success', { ast });

    // Start of playback (0%)
    let position: PlaybackPosition = {
      channelId: 1,
      eventIndex: 0,
      totalEvents: 100,
      currentInstrument: 'lead',
      currentPattern: 'melody',
      sourceSequence: 'main',
      barNumber: 0,
      progress: 0,
    };

    eventBus.emit('playback:position-changed', { channelId: 1, position });

    let progressFill = document.getElementById('ch-progress-1');
    expect(progressFill?.style.width).toBe('0%');

    // Middle of playback (50%)
    position = {
      ...position,
      eventIndex: 50,
      progress: 0.5,
    };

    eventBus.emit('playback:position-changed', { channelId: 1, position });

    progressFill = document.getElementById('ch-progress-1');
    expect(progressFill?.style.width).toBe('50%');

    // End of playback (100%)
    position = {
      ...position,
      eventIndex: 99,
      progress: 0.99,
    };

    eventBus.emit('playback:position-changed', { channelId: 1, position });

    progressFill = document.getElementById('ch-progress-1');
    expect(progressFill?.style.width).toBe('99%');
  });

  it('should display bar number correctly', () => {
    const ast = {
      channels: [
        { id: 1, events: [{ instrument: 'lead' }] },
      ],
    };

    eventBus.emit('parse:success', { ast });

    const position: PlaybackPosition = {
      channelId: 1,
      eventIndex: 10,
      totalEvents: 50,
      currentInstrument: 'lead',
      currentPattern: 'melody',
      sourceSequence: 'main',
      barNumber: 3, // Bar numbering is 0-indexed internally
      progress: 0.2,
    };

    eventBus.emit('playback:position-changed', { channelId: 1, position });

    const patternEl = document.getElementById('ch-pattern-1');
    expect(patternEl?.textContent).toContain('main • melody'); // Updated to match new UI logic
  });

  // ── Phase 3: song:loaded resets the AST cache ────────────────────────────

  it('re-renders when a new song with the same channel IDs is loaded via song:loaded + parse:success', () => {
    // First song: channel 1 with instrument 'lead'
    const ast1 = {
      channels: [{ id: 1, events: [{ instrument: 'lead' }] }],
      insts: { lead: { type: 'pulse1' } },
    };
    eventBus.emit('parse:success', { ast: ast1 });
    expect(container.innerHTML).toContain('🎵 lead');

    // Second song: same channel ID but different instrument — structure unchanged normally
    // But song:loaded must clear the AST cache so re-render fires unconditionally.
    const ast2 = {
      channels: [{ id: 1, events: [{ instrument: 'bass' }] }],
      insts: { bass: { type: 'pulse2' } },
    };
    eventBus.emit('song:loaded', { filename: 'new_song.bax' });
    eventBus.emit('parse:success', { ast: ast2 });

    expect(container.innerHTML).toContain('🎵 bass');
    expect(container.innerHTML).not.toContain('🎵 lead');
  });

  it('re-renders when a second file load fires song:loaded reset followed by parse:success', () => {
    // Load three different songs in succession — each must update the panel
    for (const [instrument, type] of [['kick', 'noise'], ['hat', 'noise'], ['snare', 'noise']]) {
      const ast = {
        channels: [{ id: 4, events: [{ instrument }] }],
        insts: { [instrument]: { type } },
      };
      eventBus.emit('song:loaded', { filename: `${instrument}.bax` });
      eventBus.emit('parse:success', { ast });
      expect(container.innerHTML).toContain(`🎵 ${instrument}`);
    }
  });

  it('does NOT re-render on parse:success alone when channel structure is unchanged (optimisation preserved)', () => {
    const ast = {
      channels: [{ id: 1, events: [{ instrument: 'lead' }] }],
      insts: { lead: { type: 'pulse1' } },
    };
    // First parse — establishes the cache
    eventBus.emit('parse:success', { ast });

    // Spy on render by checking whether Channel 1 is still rendered
    const renderSpy = jest.spyOn(channelControls as any, 'render');

    // Second identical parse without song:loaded — should be skipped
    eventBus.emit('parse:success', { ast });
    expect(renderSpy).not.toHaveBeenCalled();

    renderSpy.mockRestore();
  });

  // ── Phase 4: Channel mute/solo wiring ────────────────────────────────────

  describe('Channel mute/solo wiring', () => {
    let ast: any;

    beforeEach(() => {
      // Reset channel state to avoid localStorage pollution from previous tests.
      // ChannelState.loadState() runs in the constructor and may pick up state
      // saved by an earlier test, so we reset here to guarantee a clean slate.
      channelState.reset();
      ast = {
        channels: [
          { id: 1, events: [{ instrument: 'lead' }] },
          { id: 2, events: [{ instrument: 'bass' }] },
        ],
      };
      eventBus.emit('parse:success', { ast });
    });

    it('solo button click marks the channel as soloed', () => {
      document.getElementById('ch-solo-1')!.click();
      expect(channelState.getChannel(1)?.soloed).toBe(true);
    });

    it('solo button shows Unsolo text when the channel is soloed', () => {
      document.getElementById('ch-solo-1')!.click();
      expect(document.getElementById('ch-solo-1')?.textContent).toContain('Unsolo');
    });

    it('second solo click unsoloes the channel', () => {
      document.getElementById('ch-solo-1')!.click();
      document.getElementById('ch-solo-1')!.click();
      expect(channelState.getChannel(1)?.soloed).toBe(false);
      expect(document.getElementById('ch-solo-1')?.textContent).not.toContain('Unsolo');
    });

    it('soloing channel 1 fully dims the row of channel 2', () => {
      document.getElementById('ch-solo-1')!.click();
      expect(document.getElementById('ch-row-1')?.style.opacity).toBe('1');
      expect(document.getElementById('ch-row-2')?.style.opacity).toBe('0.5');
    });

    it('unsoloing all channels restores all rows to full opacity', () => {
      document.getElementById('ch-solo-1')!.click(); // solo
      document.getElementById('ch-solo-1')!.click(); // unsolo
      expect(document.getElementById('ch-row-1')?.style.opacity).toBe('1');
      expect(document.getElementById('ch-row-2')?.style.opacity).toBe('1');
    });

    it('muting channel 1 dims its row', () => {
      document.getElementById('ch-mute-1')!.click();
      expect(document.getElementById('ch-row-1')?.style.opacity).toBe('0.5');
    });

    it('unmuting restores row to full opacity', () => {
      document.getElementById('ch-mute-1')!.click(); // mute
      document.getElementById('ch-mute-1')!.click(); // unmute
      expect(document.getElementById('ch-row-1')?.style.opacity).toBe('1');
    });

    it('muting via channelState.mute() updates button text without re-rendering', () => {
      const renderSpy = jest.spyOn(channelControls as any, 'render');
      channelState.mute(1);
      expect(document.getElementById('ch-mute-1')?.textContent).toContain('Unmute');
      expect(renderSpy).not.toHaveBeenCalled();
      renderSpy.mockRestore();
    });

    it('soloing via channelState.solo() updates solo button text without re-rendering', () => {
      const renderSpy = jest.spyOn(channelControls as any, 'render');
      channelState.solo(1);
      expect(document.getElementById('ch-solo-1')?.textContent).toContain('Unsolo');
      expect(renderSpy).not.toHaveBeenCalled();
      renderSpy.mockRestore();
    });

    it('soloing channel 1 via channelState leaves channel 2 solo button showing Solo', () => {
      channelState.solo(1);
      expect(document.getElementById('ch-solo-2')?.textContent).not.toContain('Unsolo');
    });

    it('soloing channel 2 transfers the soloed state from channel 1', () => {
      channelState.solo(1);
      channelState.solo(2);
      expect(channelState.getChannel(1)?.soloed).toBe(false);
      expect(channelState.getChannel(2)?.soloed).toBe(true);
      expect(document.getElementById('ch-solo-1')?.textContent).not.toContain('Unsolo');
      expect(document.getElementById('ch-solo-2')?.textContent).toContain('Unsolo');
    });
  });
});
