/**
 * Web-lite top bar: brand + centered Desktop download CTA + docs/social icon links.
 */

import { brandIcon } from '../utils/icons';
import { appAssetUrl } from '../utils/app-asset-url';

export type WebLiteSocialId = 'docs' | 'github' | 'itch' | 'patreon' | 'x';

export interface WebLiteSocialLink {
  id: WebLiteSocialId;
  /** Accessible label, e.g. "GitHub". */
  label: string;
  /** Omit or leave undefined to hide the link. */
  href?: string;
}

export const WEB_LITE_DESKTOP_DOWNLOAD_URL = 'https://beatbax.com/download';

/** Links shown in the web-lite header (right side). Docs first, then beatbax.com socials. */
export const WEB_LITE_SOCIAL_LINKS: WebLiteSocialLink[] = [
  { id: 'docs', label: 'BeatBax Docs', href: 'https://beatbax.com/docs/intro' },
  { id: 'github', label: 'GitHub', href: 'https://github.com/kadraman/beatbax' },
  { id: 'itch', label: 'itch.io', href: 'https://kadraman.itch.io/beatbax' },
  { id: 'patreon', label: 'Patreon', href: 'https://www.patreon.com/kadraman' },
];

/** Build the web-lite header bar element. */
export function buildWebLiteHeader(): HTMLElement {
  const header = document.createElement('div');
  header.id = 'bb-web-lite-header';
  header.className = 'bb-web-lite-header';

  const title = document.createElement('h1');
  title.className = 'bb-web-lite-header__title';

  const icon = document.createElement('img');
  icon.src = appAssetUrl('favicon.svg');
  icon.alt = '';
  icon.className = 'bb-web-lite-header__icon';
  icon.setAttribute('aria-hidden', 'true');

  const logo = document.createElement('span');
  logo.className = 'bb-web-lite-header__logo';
  logo.textContent = 'BeatBax';
  title.append(icon, logo);
  header.appendChild(title);

  const cta = document.createElement('a');
  cta.className = 'bb-web-lite-header__cta';
  cta.href = WEB_LITE_DESKTOP_DOWNLOAD_URL;
  cta.target = '_blank';
  cta.rel = 'noopener noreferrer';
  cta.textContent = 'Download BeatBax Desktop';
  cta.title = 'Get the full BeatBax Desktop IDE';
  header.appendChild(cta);

  const social = document.createElement('nav');
  social.className = 'bb-web-lite-header__social';
  social.setAttribute('aria-label', 'BeatBax links');

  for (const link of WEB_LITE_SOCIAL_LINKS) {
    if (!link.href) continue;
    const a = document.createElement('a');
    a.className = 'bb-web-lite-header__social-link';
    a.dataset.social = link.id;
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = link.label;
    a.setAttribute('aria-label', link.label);
    a.innerHTML = brandIcon(link.id);
    social.appendChild(a);
  }

  header.appendChild(social);
  return header;
}
