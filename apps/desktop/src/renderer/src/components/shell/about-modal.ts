import { appAssetUrl } from '../../utils/app-asset-url';

export interface AboutModalInfo {
  productName?: string;
  tagline?: string;
  version?: string;
  license?: string;
  commitId?: string;
  githubUrl?: string;
  platform?: string;
}

export interface AboutModalController {
  open(): void;
  close(): void;
}

const DEFAULT_GITHUB_URL = 'https://github.com/kadraman/beatbax';
const BUG_REPORT_REPO = 'https://github.com/kadraman/beatbax/issues/new';

const DEFAULT_INFO: Required<Pick<AboutModalInfo, 'productName' | 'tagline' | 'license'>> = {
  productName: 'BeatBax',
  tagline: 'Live-coding language for retro console chiptunes.',
  license: 'MIT',
};

function openExternalLink(url: string, onOpenLink?: (url: string) => void): void {
  if (onOpenLink) {
    onOpenLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function platformLabel(platform?: string): string | undefined {
  switch (platform) {
    case 'win32': return 'Windows';
    case 'darwin': return 'macOS';
    case 'linux': return 'Linux';
    default: return platform;
  }
}

export function buildBugReportUrl(version: string, commitId: string, platform?: string): string {
  const params = new URLSearchParams({
    template: 'bug.yml',
    title: '[Bug]: ',
    version: `${version} (git: ${commitId})`,
  });
  const platformName = platformLabel(platform);
  if (platformName) params.set('platform', platformName);
  return `${BUG_REPORT_REPO}?${params.toString()}`;
}

export function buildAboutModal(
  info: AboutModalInfo = {},
  options?: { onOpenLink?: (url: string) => void },
): AboutModalController {
  const productName = info.productName ?? DEFAULT_INFO.productName;
  const tagline = info.tagline ?? DEFAULT_INFO.tagline;
  const license = info.license ?? DEFAULT_INFO.license;
  const version = info.version ?? '0.1.0';
  const commitId = info.commitId ?? 'unknown';
  const githubUrl = info.githubUrl ?? DEFAULT_GITHUB_URL;

  const backdrop = document.createElement('div');
  backdrop.className = 'bb-about-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', `About ${productName}`);

  const modalEl = document.createElement('div');
  modalEl.className = 'bb-about-modal';

  const content = document.createElement('div');
  content.className = 'bb-about-modal__content';

  const logoBtn = document.createElement('button');
  logoBtn.type = 'button';
  logoBtn.className = 'bb-about-modal__logo-btn';
  logoBtn.title = 'BeatBax on GitHub';
  logoBtn.setAttribute('aria-label', 'Open BeatBax on GitHub');

  const logo = document.createElement('img');
  logo.className = 'bb-about-modal__logo';
  logo.src = appAssetUrl('favicon.svg');
  logo.alt = productName;
  logo.width = 128;
  logo.height = 128;
  logoBtn.appendChild(logo);
  logoBtn.addEventListener('click', () => openExternalLink(githubUrl, options?.onOpenLink));

  const versionEl = document.createElement('p');
  versionEl.className = 'bb-about-modal__version';
  versionEl.textContent = `${productName} ${version}`;

  const taglineEl = document.createElement('p');
  taglineEl.className = 'bb-about-modal__tagline';
  taglineEl.textContent = tagline;

  const licenseEl = document.createElement('p');
  licenseEl.className = 'bb-about-modal__license';
  licenseEl.textContent = `Distributed under ${license} license`;

  const reportBugBtn = document.createElement('button');
  reportBugBtn.type = 'button';
  reportBugBtn.className = 'bb-about-modal__report-bug';
  reportBugBtn.textContent = `Report bug (git: ${commitId})`;
  reportBugBtn.addEventListener('click', () => {
    openExternalLink(buildBugReportUrl(version, commitId, info.platform), options?.onOpenLink);
  });

  content.append(logoBtn, versionEl, taglineEl, licenseEl, reportBugBtn);

  const actions = document.createElement('div');
  actions.className = 'bb-about-modal__actions';

  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'bb-about-modal__ok';
  okBtn.textContent = 'OK';

  actions.appendChild(okBtn);
  modalEl.append(content, actions);
  backdrop.appendChild(modalEl);
  document.body.appendChild(backdrop);

  const close = (): void => {
    backdrop.classList.remove('bb-about-modal--open');
  };

  const open = (): void => {
    backdrop.classList.add('bb-about-modal--open');
    okBtn.focus();
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  okBtn.addEventListener('click', close);
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

  return { open, close };
}
