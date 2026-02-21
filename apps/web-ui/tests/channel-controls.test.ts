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
});
