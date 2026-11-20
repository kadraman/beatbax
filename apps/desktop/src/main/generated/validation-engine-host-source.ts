/**
 * Browser ESM source for sandboxed plugin validation.
 * `null` until `scripts/bundle-validation-engine-host.cjs` runs (prepare-local / build).
 * Runtime falls back to an on-the-fly esbuild when this is null (Jest).
 */
export const VALIDATION_ENGINE_HOST_SOURCE: string | null = null;
