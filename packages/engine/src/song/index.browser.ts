/**
 * Song module exports (Browser version)
 * Uses browser-safe import resolver that doesn't depend on Node.js built-ins
 */

export { resolveSong, resolveSongAsync, isPanEmpty, parseEffectParams, parseEffectsInline } from './resolver.browser.js';
export { resolveImports, resolveImportsSync } from './importResolver.browser.js';
export type { ImportResolverOptions } from './importResolver.browser.js';
export type { SongModel, ChannelModel, ChannelEvent } from './songModel.js';
