/**
 * Web-lite top bar: brand icon + text logo + optional social icon links.
 */

import { brandIcon } from '../utils/icons';

export type WebLiteSocialId = 'github' | 'x' | 'itch';

export interface WebLiteSocialLink {
  id: WebLiteSocialId;
  /** Accessible label, e.g. "GitHub". */
  label: string;
  /** Omit or leave undefined to hide the link. */
  href?: string;
}

/** Social links shown in the web-lite header (right side). */
export const WEB_LITE_SOCIAL_LINKS: WebLiteSocialLink[] = [
  { id: 'github', label: 'GitHub', href: 'https://github.com/kadraman/beatbax' },
  // Add href when available:
  //{ id: 'x', label: 'X', href: 'https://x.com/...' },
  // { id: 'itch', label: 'itch.io', href: 'https://....itch.io/...' },
];

/** Build the web-lite header bar element. */
export function buildWebLiteHeader(): HTMLElement {
  const header = document.createElement('div');
  header.id = 'bb-web-lite-header';
  header.className = 'bb-web-lite-header';

  const title = document.createElement('h1');
  title.className = 'bb-web-lite-header__title';

  const icon = document.createElement('img');
  icon.src = '/favicon.svg';
  icon.alt = '';
  icon.className = 'bb-web-lite-header__icon';
  icon.setAttribute('aria-hidden', 'true');

  const logo = document.createElement('span');
  logo.className = 'bb-web-lite-header__logo';
  logo.textContent = 'BeatBax';
  title.append(icon, logo);
  header.appendChild(title);

  const social = document.createElement('nav');
  social.className = 'bb-web-lite-header__social';
  social.setAttribute('aria-label', 'Social links');

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
