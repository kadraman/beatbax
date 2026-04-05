import { RotaryKnob } from './rotary-knob.js';
import { Oscilloscope } from './oscilloscope.js';

/**
 * TransportBar — DOM wrapper for transport controls.
 *
 * LCD readouts: BPM, TIME, BAR:BT, STEP, LOOP, VOL
 * Buttons: ⏮ Rew, ▶ Play, ⏸ Pause, ⏹ Stop, ↻ Apply, ⚡ Live, ⟳ Loop, ● Rec
 * Nudge controls: BPM «/»; VOL via rotary knob
 */

export interface TransportBarOptions {
  container: HTMLElement;
  logoSrc?: string;
}

export class TransportBar {
  public el: HTMLElement;

  // ── Existing transport buttons ──────────────────────────────────────────
  public playButton:   HTMLButtonElement;
  public pauseButton:  HTMLButtonElement;
  public stopButton:   HTMLButtonElement;
  public applyButton:  HTMLButtonElement;
  public liveButton:   HTMLButtonElement;

  // ── New transport buttons ───────────────────────────────────────────────
  public rewindButton: HTMLButtonElement;
  public loopButton:   HTMLButtonElement;
  public recordButton: HTMLButtonElement;

  // ── Nudge / stepper buttons ─────────────────────────────────────────────
  public bpmDownButton: HTMLButtonElement;
  public bpmUpButton:   HTMLButtonElement;

  // ── Volume rotary knob ───────────────────────────────────────────────────
  public volKnob: RotaryKnob;

  // ── Oscilloscope waveform strip ──────────────────────────────────────────
  public oscilloscope: Oscilloscope;

  constructor(private opts: TransportBarOptions) {
    this.el = document.createElement('div');
    this.el.id = 'bb-transport-bar';
    this.el.className = 'bb-transport';

    // ── LCD readout cluster ─────────────────────────────────────────────
    const infoWrap = document.createElement('div');
    infoWrap.className = 'bb-transport__info';

    const bpmLcd     = this._mkLcd('BPM',    '120',   '000');
    const timeLcd    = this._mkLcd('TIME',   '00:00', '00:00');
    const barBeatLcd = this._mkLcd('BAR:BT', '001:1', '000:0');
    const stepLcd    = this._mkLcd('STEP',   '01/01', '00/00');
    const loopLcd    = this._mkLcd('LOOP',   '0FF',   '000');

    // Priority classes drive the responsive hide cascade
    barBeatLcd.lcd.classList.add('bb-transport__lcd--pri-1');
    stepLcd.lcd.classList.add('bb-transport__lcd--pri-1');
    timeLcd.lcd.classList.add('bb-transport__lcd--pri-4');
    loopLcd.lcd.classList.add('bb-transport__lcd--pri-2');

    // ── Beat indicator LED ───────────────────────────────────────────────
    const beatLed = document.createElement('span');
    beatLed.className = 'bb-transport__beat-led';
    beatLed.setAttribute('aria-hidden', 'true');
    beatLed.title = 'Beat indicator';
    infoWrap.prepend(beatLed);

    infoWrap.append(
      bpmLcd.lcd, timeLcd.lcd, barBeatLcd.lcd,
      stepLcd.lcd, loopLcd.lcd
    );
    this.el.appendChild(infoWrap);

    // ── BPM nudge («/») ─────────────────────────────────────────────────
    const bpmNudgeSep = this._mkSep();
    bpmNudgeSep.classList.add('bb-transport__separator--pri-3');
    this.el.appendChild(bpmNudgeSep);
    const mkNudge = (label: string, title: string) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.className = 'bb-transport__nudge-btn';
      return b as HTMLButtonElement;
    };
    this.bpmDownButton = mkNudge('«', 'BPM −1');
    this.bpmUpButton   = mkNudge('»', 'BPM +1');
    const bpmNudgeLabel = document.createElement('span');
    bpmNudgeLabel.className = 'bb-transport__nudge-label';
    bpmNudgeLabel.textContent = 'BPM';
    const bpmNudgeRow = document.createElement('div');
    bpmNudgeRow.className = 'bb-transport__nudge-row';
    bpmNudgeRow.append(this.bpmDownButton, this.bpmUpButton);
    const bpmNudge = document.createElement('div');
    bpmNudge.className = 'bb-transport__nudge-wrap bb-transport__nudge-wrap--pri-3';
    bpmNudge.append(bpmNudgeLabel, bpmNudgeRow);
    this.el.appendChild(bpmNudge);

    // ── Transport buttons ───────────────────────────────────────────────
    this.el.appendChild(this._mkSep());
    const mkBtn = (label: string, title = '', variant = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      if (title) b.setAttribute('aria-label', title);
      b.className = `bb-transport__btn${variant ? ` bb-transport__btn--${variant}` : ''}`;
      return b as HTMLButtonElement;
    };

    this.rewindButton = mkBtn('⏮',       'Rewind to start', 'rewind');
    this.playButton   = mkBtn('▶ Play',  'Play current song (F5 / Space when outside editor)', 'play');
    this.pauseButton  = mkBtn('⏸ Pause', 'Pause playback', 'pause');
    this.stopButton   = mkBtn('⏹ Stop',  'Stop playback (F8 / Esc)', 'stop');
    this.applyButton  = mkBtn('↻ Apply', 'Apply & re-play (Ctrl+Enter)', 'apply');
    this.liveButton   = mkBtn('⚡ Live',  'Toggle live-play mode', 'live');
    this.liveButton.classList.add('bb-live-btn');
    this.loopButton   = mkBtn('⟳ Loop',  'Toggle loop playback', 'loop');
    this.loopButton.classList.add('bb-loop-btn', 'bb-transport__btn--pri-2');
    this.recordButton = mkBtn('● Rec',   'Arm recording (coming soon)', 'record');
    this.recordButton.disabled = true;
    this.recordButton.classList.add('bb-transport__btn--pri-2');
    this.rewindButton.classList.add('bb-transport__btn--pri-4');
    this.pauseButton.classList.add('bb-transport__btn--pri-5');
    this.liveButton.classList.add('bb-transport__btn--pri-5');
    this.applyButton.classList.add('bb-transport__btn--pri-5');

    this.el.append(
      this.rewindButton, this.playButton, this.pauseButton, this.stopButton,
      this.applyButton, this.liveButton, this.loopButton, this.recordButton
    );

    // ── Master volume knob — standalone directly on the transport bar ──────
    // The knob is always visible (hides only at the pri-5 breakpoint, ≤549 px)
    // so users retain volume control even when the numeric LCD is hidden.
    this.volKnob = new RotaryKnob(28);
    this.volKnob.el.classList.add('bb-transport__vol-knob');
    this.el.appendChild(this.volKnob.el);

    // ── VOL LCD — separate numeric readout; hidden below 1200 px ──────────
    const volLcdSep = this._mkSep();
    volLcdSep.classList.add('bb-transport__separator--vol-lcd');
    this.el.appendChild(volLcdSep);
    const volLcd = this._mkLcd('VOL', '100%', '000%');
    volLcd.lcd.classList.add('bb-transport__lcd--vol');
    this.el.appendChild(volLcd.lcd);

    // ── Oscilloscope — LCD bezel, fills remaining right-side space ──────────
    this.oscilloscope = new Oscilloscope();
    const scopeWrap = document.createElement('div');
    scopeWrap.className = 'bb-transport__lcd bb-transport__lcd--scope';
    const scopeLabel = document.createElement('span');
    scopeLabel.className = 'bb-transport__lcd-label';
    scopeLabel.textContent = 'SCOPE';
    scopeWrap.append(scopeLabel, this.oscilloscope.el);
    this.el.appendChild(scopeWrap);

    // Insert at top of provided container (before existing children)
    const parent = this.opts.container;
    parent.insertBefore(this.el, parent.firstChild ?? null);

    // Keep LCD value element references for update methods
    this._bpmEl     = bpmLcd.value;
    this._timeEl    = timeLcd.value;
    this._barBeatEl = barBeatLcd.value;
    this._stepEl    = stepLcd.value;
    this._loopEl    = loopLcd.value;
    this._loopLcd   = loopLcd.lcd;
    this._volEl     = volLcd.value;
    this._beatLed   = beatLed;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private _mkSep(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'bb-transport__separator';
    return sep;
  }

  /** Create a labelled LCD segment display with optional ghost (inactive) digits beneath. */
  private _mkLcd(
    labelText: string, initialValue: string, ghost?: string
  ): { lcd: HTMLElement; value: HTMLElement } {
    const lcd = document.createElement('div');
    lcd.className = 'bb-transport__lcd';
    const label = document.createElement('span');
    label.className = 'bb-transport__lcd-label';
    label.textContent = labelText;
    const screen = document.createElement('div');
    screen.className = 'bb-transport__lcd-screen';
    if (ghost) {
      const ghostEl = document.createElement('span');
      ghostEl.className = 'bb-transport__lcd-ghost';
      ghostEl.textContent = ghost;
      ghostEl.setAttribute('aria-hidden', 'true');
      screen.appendChild(ghostEl);
    }
    const value = document.createElement('span');
    value.className = 'bb-transport__lcd-value';
    value.textContent = initialValue;
    screen.appendChild(value);
    lcd.append(label, screen);
    return { lcd, value };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  dispose(): void { this.el.remove(); }
  show(): void    { this.el.style.display = ''; }
  hide(): void    { this.el.style.display = 'none'; }
  toggle(): void  { if (this.isVisible()) this.hide(); else this.show(); }
  isVisible(): boolean { return this.el.style.display !== 'none'; }

  // ── Private LCD element refs ─────────────────────────────────────────────
  private _bpmEl?:     HTMLElement;
  private _timeEl?:    HTMLElement;
  private _barBeatEl?: HTMLElement;
  private _stepEl?:    HTMLElement;
  private _loopEl?:    HTMLElement;
  private _loopLcd?:   HTMLElement;
  private _volEl?:     HTMLElement;
  private _beatLed?:   HTMLElement;

  // ── Public update API ────────────────────────────────────────────────────

  setBpm(bpm: number): void {
    if (this._bpmEl) this._bpmEl.textContent = String(bpm).padStart(3, '0');
  }

  setTimeLabel(label: string): void {
    if (!this._timeEl) return;
    const prefix = 'Time: ';
    const raw = label.startsWith(prefix) ? label.slice(prefix.length) : label;
    const [mins, secs] = raw.split(':');
    this._timeEl.textContent = secs !== undefined
      ? `${mins.padStart(2, '0')}:${secs.padStart(2, '0')}`
      : raw;
  }

  /** Update the BAR:BT display. bar and beat are 1-based integers. */
  setBarBeat(bar: number, beat: number): void {
    if (this._barBeatEl) {
      this._barBeatEl.textContent = `${String(bar).padStart(3, '0')}:${beat}`;
    }
  }

  /** Update the STEP display. step and total are 1-based. */
  setStep(step: number, total: number): void {
    if (this._stepEl) {
      const s = String(Math.max(1, step)).padStart(2, '0');
      const t = String(Math.max(1, total)).padStart(2, '0');
      this._stepEl.textContent = `${s}/${t}`;
    }
  }

  /** Toggle the LOOP LCD and css active class. */
  setLoopActive(active: boolean): void {
    if (this._loopEl)  this._loopEl.textContent = active ? '0N ' : '0FF';
    if (this._loopLcd) this._loopLcd.classList.toggle('bb-transport__lcd--active', active);
  }

  /** Reset position-derived LCDs to their idle state. */
  resetPosition(): void {
    this.setBarBeat(1, 1);
    this.setStep(1, 1);
    this.setTimeLabel('00:00');
  }

  /** Update the VOL display and knob. pct is 0-100. */
  setVol(pct: number): void {
    if (this._volEl) this._volEl.textContent = `${String(pct).padStart(3, ' ')}%`;
    this.volKnob?.setValue(pct);
  }

  /** Trigger a single beat-flash on the LED indicator. */
  flashBeatLed(): void {
    const led = this._beatLed;
    if (!led) return;
    // Remove first to allow re-triggering mid-animation
    led.classList.remove('bb-transport__beat-led--flash');
    // Force reflow so the class removal takes effect before re-adding
    void led.offsetWidth;
    led.classList.add('bb-transport__beat-led--flash');
  }
}
