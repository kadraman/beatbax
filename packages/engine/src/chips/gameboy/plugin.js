import { gameboyUIContributions } from './ui-contributions.js';
// ─── Per-channel PCM backends ─────────────────────────────────────────────────
/**
 * Minimal stateful PCM backend for a single Game Boy channel.
 * Keeps track of the current note/instrument state; the heavy-duty PCM
 * rendering continues to live in `audio/pcmRenderer.ts` for the CLI/headless
 * path and in `audio/playback.ts` for WebAudio.  This backend is used by
 * the plugin system for new chip integration tests and forward compatibility.
 */
class GBChannelBackend {
    channelIndex;
    currentFreq = 0;
    currentInst = null;
    active = false;
    constructor(channelIndex) {
        this.channelIndex = channelIndex;
    }
    reset() {
        this.currentFreq = 0;
        this.currentInst = null;
        this.active = false;
    }
    noteOn(frequency, instrument) {
        this.currentFreq = frequency;
        this.currentInst = instrument;
        this.active = true;
    }
    noteOff() {
        this.active = false;
    }
    applyEnvelope(_frame) {
        // Envelope automation is handled inside renderNote for GB
    }
    render(buffer, sampleRate) {
        if (!this.active || !this.currentInst)
            return;
        const inst = this.currentInst;
        const type = (inst.type || '').toLowerCase();
        if (type.includes('noise')) {
            this._renderNoise(buffer, sampleRate);
        }
        else if (this.currentFreq <= 0) {
            return;
        }
        else if (type.includes('pulse')) {
            this._renderPulse(buffer, sampleRate);
        }
        else if (type.includes('wave')) {
            this._renderWave(buffer, sampleRate);
        }
    }
    _renderPulse(buffer, sampleRate) {
        const inst = this.currentInst;
        let duty = 0.5;
        if (inst.duty) {
            const d = parseFloat(String(inst.duty));
            if (!isNaN(d))
                duty = d > 1 ? d / 100 : d;
        }
        const freq = this.currentFreq;
        const len = buffer.length;
        let phase = 0;
        const phaseInc = freq / sampleRate;
        for (let i = 0; i < len; i++) {
            buffer[i] += (phase < duty ? 0.3 : -0.3);
            phase = (phase + phaseInc) % 1;
        }
    }
    _renderWave(buffer, sampleRate) {
        const inst = this.currentInst;
        let table = [];
        if (Array.isArray(inst.wave)) {
            table = inst.wave;
        }
        else if (typeof inst.wave === 'string') {
            try {
                table = JSON.parse(inst.wave);
            }
            catch (_) { }
        }
        if (!table.length)
            return;
        const freq = this.currentFreq;
        const len = buffer.length;
        const cycleLen = table.length;
        const mean = table.reduce((a, b) => a + b, 0) / cycleLen;
        let phase = 0;
        const phaseInc = (freq * cycleLen) / sampleRate;
        for (let i = 0; i < len; i++) {
            const idx = Math.floor(phase) % cycleLen;
            buffer[i] += ((table[idx] - mean) / 15) * 0.9;
            phase = (phase + phaseInc) % cycleLen;
        }
    }
    _renderNoise(buffer, sampleRate) {
        const inst = this.currentInst;
        const divisor = inst.divisor ? Number(inst.divisor) : 3;
        const shift = inst.shift ? Number(inst.shift) : 4;
        const GB_CLOCK = 4194304;
        const div = Math.max(1, divisor);
        const lfsrHz = GB_CLOCK / (div * Math.pow(2, (shift || 0) + 1));
        let phase = 0;
        let lfsr = 1;
        const len = buffer.length;
        for (let i = 0; i < len; i++) {
            phase += lfsrHz / sampleRate;
            const ticks = Math.floor(phase);
            if (ticks > 0) {
                for (let t = 0; t < ticks; t++) {
                    const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
                    lfsr = ((lfsr >> 1) | (bit << 14)) >>> 0;
                }
                phase -= ticks;
            }
            buffer[i] += (lfsr & 1) ? 0.3 : -0.3;
        }
    }
}
// ─── Instrument validation ────────────────────────────────────────────────────
const VALID_GB_TYPES = new Set(['pulse1', 'pulse2', 'wave', 'noise']);
const VALID_DUTY_VALUES = new Set(['12.5', '25', '50', '75', '12', '0.125', '0.25', '0.5', '0.75']);
function validateGBInstrument(inst) {
    const errors = [];
    const type = (inst.type || '').toLowerCase();
    if (type && !VALID_GB_TYPES.has(type)) {
        errors.push({
            field: 'type',
            message: `Unknown Game Boy instrument type '${inst.type}'. Valid types: ${[...VALID_GB_TYPES].join(', ')}`
        });
        return errors; // No point checking other fields if type is unknown
    }
    if (type.includes('pulse')) {
        if (inst.duty !== undefined) {
            const d = parseFloat(String(inst.duty));
            if (isNaN(d)) {
                errors.push({ field: 'duty', message: `duty must be a number (e.g. 50 for 50%)` });
            }
            else if (d < 0 || d > 100) {
                errors.push({ field: 'duty', message: `duty must be between 0 and 100 (percent)` });
            }
        }
    }
    if (type === 'wave') {
        if (inst.wave === undefined) {
            errors.push({ field: 'wave', message: `wave instruments must include a 'wave' parameter` });
        }
        else {
            const table = Array.isArray(inst.wave)
                ? inst.wave
                : (() => { try {
                    return JSON.parse(String(inst.wave));
                }
                catch (_) {
                    return null;
                } })();
            if (!Array.isArray(table)) {
                errors.push({ field: 'wave', message: `wave must be an array of 16 4-bit samples (0-15)` });
            }
            else if (table.length !== 16 && table.length !== 32) {
                errors.push({ field: 'wave', message: `wave array must have 16 or 32 samples, got ${table.length}` });
            }
        }
    }
    return errors;
}
// ─── Plugin definition ────────────────────────────────────────────────────────
export const gameboyPlugin = {
    name: 'gameboy',
    version: '1.0.0',
    channels: 4,
    supportsPerChannelVolume: false,
    instrumentVolumeRange: { min: 0, max: 15 },
    validateInstrument(inst) {
        return validateGBInstrument(inst);
    },
    createChannel(channelIndex, _audioContext) {
        return new GBChannelBackend(channelIndex);
    },
    uiContributions: gameboyUIContributions,
};
export default gameboyPlugin;
//# sourceMappingURL=plugin.js.map