/**
 * TransportBar — DOM wrapper for transport buttons (Play / Pause / Stop / Apply / Live)
 * Keeps main.ts slimmer by encapsulating DOM creation and exposes the buttons
 * used by `TransportControls`.
 */

export interface TransportBarOptions {
  container: HTMLElement;
  logoSrc?: string;
}

export class TransportBar {
  public el: HTMLElement;
  public playButton: HTMLButtonElement;
  public pauseButton: HTMLButtonElement;
  public stopButton: HTMLButtonElement;
  public applyButton: HTMLButtonElement;
  public liveButton: HTMLButtonElement;

  constructor(private opts: TransportBarOptions) {
    this.el = document.createElement('div');
    this.el.id = 'bb-transport-bar';
    this.el.className = 'bb-transport';
    this.el.style.cssText = `
      padding: 6px 10px;
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    `;

    // Compact transport info (BPM, Time)
    const infoWrap = document.createElement('div');
    infoWrap.className = 'bb-transport__info';
    infoWrap.style.cssText = 'display:flex;flex-direction:row;gap:10px;align-items:center;margin-right:8px;font-size:11px;opacity:0.85;';
    const bpmEl = document.createElement('div');
    bpmEl.className = 'bb-transport__bpm';
    bpmEl.textContent = 'BPM: 120';
    const timeEl = document.createElement('div');
    timeEl.className = 'bb-transport__time';
    timeEl.textContent = 'Time: 0:00';
    infoWrap.append(bpmEl, timeEl);
    this.el.appendChild(infoWrap);

    // Buttons
    const mkBtn = (label: string, title = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.style.cssText = 'padding: 6px 14px; font-size: 13px; cursor: pointer;';
      return b as HTMLButtonElement;
    };

    this.playButton = mkBtn('▶ Play', 'Play current song (F5 / Space when outside editor)');
    this.pauseButton = mkBtn('⏸ Pause', 'Pause playback');
    this.stopButton = mkBtn('⏹ Stop', 'Stop playback (F8 / Esc)');
    this.applyButton = mkBtn('🔄 Apply', 'Apply & re-play (Ctrl+Enter)');
    this.liveButton = mkBtn('⚡ Live', 'Toggle live-play mode');
    this.liveButton.style.border = '2px solid transparent';

    this.el.append(this.playButton, this.pauseButton, this.stopButton, this.applyButton, this.liveButton);

    // Insert at top of provided container (before existing children)
    const parent = this.opts.container;
    parent.insertBefore(this.el, parent.firstChild ?? null);

    // Keep references to info elements for updates
    this._bpmEl = bpmEl;
    this._timeEl = timeEl;
  }

  dispose(): void {
    this.el.remove();
  }

  show(): void {
    this.el.style.display = '';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  toggle(): void {
    const visible = this.isVisible();
    if (visible) this.hide(); else this.show();
  }

  isVisible(): boolean {
    return this.el.style.display !== 'none';
  }

  // -- Public update API -------------------------------------------------
  private _bpmEl?: HTMLElement;
  private _timeEl?: HTMLElement;

  setBpm(bpm: number): void {
    if (this._bpmEl) this._bpmEl.textContent = `BPM: ${bpm}`;
  }

  setTimeLabel(label: string): void {
    if (!this._timeEl) return;
    // Preserve the 'Time ' prefix so the label remains clear when the
    // counter is started (calls previously replaced the whole text).
    const prefix = 'Time: ';
    this._timeEl.textContent = label.startsWith(prefix) ? label : `${prefix}${label}`;
  }
}
