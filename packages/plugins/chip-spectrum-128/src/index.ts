/**
 * @beatbax/plugin-chip-spectrum-128 — ZX Spectrum 128 / AY-3-8912 PSG chip plugin.
 *
 * Provides three audio channels (A/B/C) mapped to AY-3-8912 tone generators.
 * A single shared chip simulator is used per song session, with register intent
 * arbitration ensuring deterministic, hardware-accurate output.
 *
 * Usage:
 * ```typescript
 * import { BeatBaxEngine } from '@beatbax/engine';
 * import spectrumPlugin from '@beatbax/plugin-chip-spectrum-128';
 *
 * const engine = new BeatBaxEngine();
 * engine.registerChipPlugin(spectrumPlugin);
 * ```
 *
 * In BeatBax scripts:
 * ```bax
 * chip spectrum-128
 * bpm 120
 * inst lead type=tone1 vol=12 arp_env=[0,4,7|0]
 * inst bass type=tone2 vol=14
 * inst pad  type=tone3 vol=10
 * channel 1 => inst lead pat melody
 * channel 2 => inst bass pat bass
 * channel 3 => inst pad  pat pad
 * play
 * ```
 */
import type { ChipPlugin, ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { version } from './version.js';
import { setPlatformRegion, getPlatformProfile } from './platform-profiles.js';
import { AyChipSimulator } from './ay-chip.js';
import { RegisterArbitrator } from './register-arbitrator.js';
import { RegisterLog } from './register-log.js';
import { AyChannelBackend, type AySongSession } from './channel-backend.js';
import { validateSpectrumInstrument, SPECTRUM_TYPES } from './validate.js';
import { spectrumUIContributions } from './ui-contributions.js';
import { spectrumSongWizard } from './songWizard.js';
import type { RegisterIntent } from './register-intent.js';

// ── Song session ─────────────────────────────────────────────────────────────

/** Module-level current session — reset on each beginSongSession() call. */
let currentSession: InternalSongSession | null = null;

interface InternalSongSession extends AySongSession {
  backends: AyChannelBackend[];
  log: RegisterLog;
  _pendingIntents: RegisterIntent[];
  finalize(): void;
}

function createAySongSession(): InternalSongSession {
  const chip = new AyChipSimulator();
  chip.reset();

  const arbitrator = new RegisterArbitrator();
  arbitrator.clearDiagnostics();

  const log = new RegisterLog();
  log.clear();

  const session: InternalSongSession = {
    arbitrator,
    chip,
    log,
    currentTick: 0,
    prevRegs: new Uint8Array(16),
    backends: [],
    _pendingIntents: [],

    finalize() {
      // Flush any remaining pending intents into the log
      if (this._pendingIntents.length > 0) {
        const frame = this.arbitrator.arbitrate(
          this.currentTick,
          this._pendingIntents,
          this.prevRegs,
        );
        this.log.append(frame);
        this.chip.writeRegister(6, frame.regs[6]);
        this.chip.writeRegister(7, frame.regs[7]);
        for (let r = 0; r < 16; r++) {
          this.chip.writeRegister(r, frame.regs[r]);
        }
        this.prevRegs = new Uint8Array(frame.regs);
        this._pendingIntents = [];
      }
    },
  };

  return session;
}

// ── Tick advancement ──────────────────────────────────────────────────────────

/**
 * Advance the current session by one 50 Hz tick.
 * Collects pending intents, arbitrates, commits to chip, logs.
 */
function advanceTick(): void {
  if (!currentSession) return;

  const session = currentSession;
  const intents: RegisterIntent[] = session._pendingIntents.splice(0);

  const frame = session.arbitrator.arbitrate(
    session.currentTick,
    intents,
    session.prevRegs,
  );

  // Commit to chip
  for (let r = 0; r < 16; r++) {
    session.chip.writeRegister(r, frame.regs[r]);
  }
  session.chip.step(getPlatformProfile().ayClockHz / 50);

  session.log.append(frame);
  session.prevRegs = new Uint8Array(frame.regs);
  session.currentTick++;
}

// ── Plugin definition ─────────────────────────────────────────────────────────

type SpectrumChipPlugin = ChipPlugin & {
  aliases?: readonly string[];
  configureForSong(song: { chip?: string; chipRegion?: string }): void;
  beginSongSession(): void;
  getCurrentSession(): InternalSongSession | null;
};

const spectrumPlugin: SpectrumChipPlugin = {
  name: 'spectrum-128',
  aliases: ['spectrum', 'ay', 'ay-3-8912'],
  version,
  channels: 3,
  supportsPerChannelVolume: true,
  instrumentVolumeRange: { min: 0, max: 15 },
  uiContributions: spectrumUIContributions,
  newSongWizard: spectrumSongWizard,

  validateInstrument(inst: InstrumentNode) {
    return validateSpectrumInstrument(inst);
  },

  configureForSong(song: { chip?: string; chipRegion?: string }) {
    setPlatformRegion(song?.chipRegion ?? 'spectrum-128');
  },

  beginSongSession() {
    currentSession = createAySongSession();
  },

  getCurrentSession() {
    return currentSession;
  },

  createChannel(channelIndex: number, _audioContext: BaseAudioContext): ChipChannelBackend {
    // Ensure a session exists (engine may not call beginSongSession explicitly)
    if (!currentSession) {
      currentSession = createAySongSession();
    }

    const channel = channelIndex as 0 | 1 | 2;
    if (channel < 0 || channel > 2) {
      throw new Error(`Spectrum 128 plugin: invalid channel index ${channelIndex} (valid: 0–2)`);
    }

    const backend = new AyChannelBackend(channel, currentSession);
    currentSession.backends.push(backend);
    return backend;
  },
};

export default spectrumPlugin;
export { spectrumPlugin };

// Re-export utilities
export { SPECTRUM_TYPES } from './validate.js';
export { validateSong } from './validate-song.js';
export {
  getPlatformProfile,
  setPlatformRegion,
  PLATFORM_PROFILES,
  type PlatformProfile,
} from './platform-profiles.js';
export {
  freqToTonePeriod,
  freqToEnvPeriod,
  tonePeriodToFreq,
  midiToTonePeriod,
  midiToEnvPeriod,
} from './periodTables.js';
export { AyChipSimulator } from './ay-chip.js';
export { RegisterArbitrator } from './register-arbitrator.js';
export { RegisterLog } from './register-log.js';
export { AyChannelBackend } from './channel-backend.js';
export { renderFromRegisterLog } from './audio-from-registers.js';
export { advanceTick };
