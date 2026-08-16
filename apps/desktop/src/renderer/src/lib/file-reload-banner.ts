export type FileReloadBannerMode = 'conflict' | 'deleted';

export interface FileReloadBannerOptions {
  host: HTMLElement;
  mode: FileReloadBannerMode;
  onReload?: () => void;
  onKeep: () => void;
}

let currentBanner: HTMLElement | null = null;

export function dismissFileReloadBanner(): void {
  currentBanner?.remove();
  currentBanner = null;
}

export function showFileReloadBanner(options: FileReloadBannerOptions): void {
  dismissFileReloadBanner();

  const banner = document.createElement('div');
  banner.className = 'bb-file-reload-banner';
  banner.setAttribute('role', 'status');

  const label = document.createElement('span');
  label.className = 'bb-file-reload-banner-label';
  label.textContent = options.mode === 'deleted'
    ? 'This file was deleted or moved on disk.'
    : 'This file has changed on disk.';

  banner.append(label);

  if (options.mode === 'conflict' && options.onReload) {
    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'bb-file-reload-banner-reload';
    reloadBtn.type = 'button';
    reloadBtn.textContent = 'Reload';
    reloadBtn.addEventListener('click', () => {
      dismissFileReloadBanner();
      options.onReload?.();
    });
    banner.append(reloadBtn);
  }

  const keepBtn = document.createElement('button');
  keepBtn.className = 'bb-file-reload-banner-keep';
  keepBtn.type = 'button';
  keepBtn.textContent = 'Keep editing';
  keepBtn.addEventListener('click', () => {
    dismissFileReloadBanner();
    options.onKeep();
  });
  banner.append(keepBtn);

  options.host.appendChild(banner);
  currentBanner = banner;
}
