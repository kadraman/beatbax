import { appAssetUrl } from '../src/utils/app-asset-url';

describe('appAssetUrl', () => {
  it('resolves public assets relative to the current page URL', () => {
    expect(appAssetUrl('favicon.svg')).toBe(new URL('favicon.svg', window.location.href).href);
    expect(appAssetUrl('/favicon.svg')).toBe(new URL('favicon.svg', window.location.href).href);
  });
});
