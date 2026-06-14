/**
 * Resolve a public asset path against the current page URL.
 * Works in Vite dev (http), deployed web (https), and Electron file:// loads.
 */
export function appAssetUrl(relativePath: string): string {
  const normalized = relativePath.replace(/^\//, '');
  return new URL(normalized, window.location.href).href;
}
