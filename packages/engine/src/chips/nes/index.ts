/**
 * NES chip public utilities and plugin export.
 */
export { nesPlugin } from './plugin.js';
export {
  PULSE_PERIOD,
  TRIANGLE_PERIOD,
  NOISE_PERIOD_TABLE,
  NOISE_PERIOD_TABLE_NTSC,
  NOISE_PERIOD_TABLE_PAL,
  DMC_RATE_TABLE,
  DMC_RATE_TABLE_NTSC,
  DMC_RATE_TABLE_PAL,
  NES_CLOCK_NTSC,
  NES_CLOCK_PAL,
  setNesClockRegion,
  getNesClockRegion,
} from './periodTables.js';
export {
  nesMix,
  getNesGainWeights,
  NES_MIX_GAIN,
} from './mixer.js';
export { validateNesInstrument } from './validate.js';
export { decodeDMC, resolveDMCSample, resolveRawDMCSample, resolveGitHubUrl, preloadDMCSamples } from './dmc.js';
export {
  encodeDMC,
  encodeDMCFromPCM,
  packBitsLSBFirst,
  trimDmcByteLength,
  formatDmcInstrumentLine,
  getDmcRateHz,
  type EncodeDMCOptions,
  type EncodeDMCResult,
} from './dmcEncode.js';
