/**
 * VGM exporter constants.
 *
 * All values for the SN76489 PSG (Sega Master System / Game Gear) VGM export.
 * Reference: https://vgmrips.net/wiki/VGM_Specification
 */

// ─── File identity ──────────────────────────────────────────────────────────

/** VGM file magic bytes: "Vgm " (0x56 0x67 0x6D 0x20) */
export const VGM_MAGIC = 0x206d6756; // little-endian uint32

/**
 * VGM format version 1.50.
 *
 * Reasons:
 *  - v1.50 defines SN76489 feedback (0x28) and shift-register width (0x2A),
 *    which ensures correct noise-channel LFSR behaviour in VGMPlay.
 *  - For versions < 1.51 the data always starts at 0x40 — there are no
 *    extended chip-clock fields beyond 0x40 that would overlap with our
 *    command stream.
 *  - Using v1.61 caused VGMPlay to read PSG command bytes at offset 0x80+
 *    as GB/NES chip clocks, making the file fail to open.
 *  - The Game Gear 0x4F stereo command is valid in all VGM versions.
 */
export const VGM_VERSION = 0x00000150;

// ─── Header field offsets ────────────────────────────────────────────────────

export const HDR_EOF_OFFSET    = 0x04; // relative to 0x04; total_size - 4
export const HDR_VERSION       = 0x08;
export const HDR_SN76489_CLOCK = 0x0C;
export const HDR_YM2413_CLOCK  = 0x10; // 0 for PSG-only
export const HDR_GD3_OFFSET    = 0x14; // relative to 0x14; 0 if no GD3
export const HDR_TOTAL_SAMPLES = 0x18;
export const HDR_LOOP_OFFSET   = 0x1C; // relative to 0x1C; 0 if no loop
export const HDR_LOOP_SAMPLES  = 0x20; // 0 if no loop
export const HDR_RATE          = 0x24; // frame rate hint (60 NTSC / 50 PAL)
export const HDR_SN_FEEDBACK   = 0x28; // uint16: LFSR feedback taps bit0^bit1 (BeatBax SMS parity)
export const HDR_SN_SHIFT_REG  = 0x2A; // uint8: 15-bit LFSR width (BeatBax SMS parity)
export const HDR_SN_FLAGS      = 0x2B; // uint8: 0 (standard)
export const HDR_DATA_OFFSET   = 0x34; // relative to 0x34; points to VGM data start

/** Size of the VGM header (data starts at 0x40, so data offset relative value = 0x0C) */
export const VGM_HEADER_SIZE       = 0x40;
/**
 * Relative data offset stored at 0x34.
 * For VGM ≥ 1.51 this is 0x0C (0x34 + 0x0C = 0x40).
 * For VGM 1.50 the field does not exist — write 0 so that players that
 * read it anyway treat 0 as "use the default 0x40".
 */
export const VGM_DATA_OFFSET_VALUE = 0x00;

// ─── Clock rates ─────────────────────────────────────────────────────────────

export const SN76489_CLOCK_NTSC = 3579545; // Hz (SMS NTSC / Game Gear)
export const SN76489_CLOCK_PAL  = 3546895; // Hz (SMS PAL)

// ─── SN76489 PSG register encoding ───────────────────────────────────────────

/** Number of tone channels */
export const PSG_TONE_CHANNELS = 3;
/** Total PSG channels (3 tone + 1 noise) */
export const PSG_CHANNELS = 4;

/**
 * Build the tone period latch byte for a given channel.
 * Format: 1 CH1 CH0 0 D3 D2 D1 D0
 *
 * @param channel  PSG channel 0-2 (tone)
 * @param period   10-bit period value
 */
export function toneLatchByte(channel: number, period: number): number {
  return 0x80 | ((channel & 0x3) << 5) | (period & 0x0F);
}

/**
 * Build the tone period data byte (high 6 bits).
 * Format: 0 0 D9 D8 D7 D6 D5 D4
 *
 * @param period   10-bit period value
 */
export function toneDataByte(period: number): number {
  return (period >> 4) & 0x3F;
}

/**
 * Build the volume latch byte for any PSG channel.
 * Format: 1 CH1 CH0 1 V3 V2 V1 V0
 *
 * @param channel     PSG channel 0-3
 * @param attenuation 4-bit attenuation (0=loudest, 15=mute)
 */
export function volumeLatchByte(channel: number, attenuation: number): number {
  return 0x90 | ((channel & 0x3) << 5) | (attenuation & 0x0F);
}

/**
 * Build the noise control register byte.
 * Format: 1 1 1 0 0 FB R1 R0  (channel 3 implicit)
 *
 * @param isWhite  true = white noise (FB=1), false = periodic noise (FB=0)
 * @param rate     Noise rate 0-3 (0-2 = fixed dividers, 3 = use Tone3 period)
 */
export function noiseControlByte(isWhite: boolean, rate: number): number {
  const fb = isWhite ? 0x04 : 0x00;
  return 0xE0 | fb | (rate & 0x03);
}

// ─── SN76489 hardware parameters ─────────────────────────────────────────────

/** Feedback taps for bit0^bit1 white-noise parity with BeatBax SMS backend. */
export const SN76489_FEEDBACK          = 0x0003;
/** SN76489 noise LFSR width used by BeatBax SMS backend. */
export const SN76489_SHIFT_REG_WIDTH   = 15;
/** SN76489 flags (standard). */
export const SN76489_FLAGS             = 0x00;

// ─── VGM command bytes ────────────────────────────────────────────────────────

/** Game Gear stereo write (followed by 1 data byte) */
export const CMD_GG_STEREO = 0x4F;
/** SN76489 PSG write (followed by 1 data byte) */
export const CMD_PSG_WRITE = 0x50;
/** Wait N samples (followed by 2-byte little-endian sample count) */
export const CMD_WAIT_N    = 0x61;
/** Wait 735 samples (1/60 s at 44100 Hz) */
export const CMD_WAIT_735  = 0x62;
/** Wait 882 samples (1/50 s at 44100 Hz) */
export const CMD_WAIT_882  = 0x63;
/** End of sound data */
export const CMD_END       = 0x66;

// ─── Audio timing ────────────────────────────────────────────────────────────

export const VGM_SAMPLE_RATE     = 44100;
/** Samples in one NTSC video frame (44100/60) */
export const SAMPLES_PER_60HZ   = 735;
/** Samples in one PAL video frame (44100/50) */
export const SAMPLES_PER_50HZ   = 882;
/** Maximum sample count in a single CMD_WAIT_N (16-bit) */
export const MAX_WAIT_N_SAMPLES  = 0xFFFF;

// ─── GD3 tag ─────────────────────────────────────────────────────────────────

/** GD3 tag magic: "Gd3 " */
export const GD3_MAGIC   = 0x20336447; // little-endian uint32
/** GD3 version 1.00 */
export const GD3_VERSION = 0x00000100;
