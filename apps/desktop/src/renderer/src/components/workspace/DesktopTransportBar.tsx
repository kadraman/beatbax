import { renderToStaticMarkup } from 'react-dom/server';
import { RotaryKnob } from './rotary-knob';

export interface DesktopVolumeKnobHandle {
  el: HTMLElement;
  onChange: (handler: (value: number) => void) => void;
  setValue: (value: number) => void;
  redraw: () => void;
}

export interface DesktopTransportBarHandle {
  el: HTMLElement;
  playButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  applyButton: HTMLButtonElement;
  liveButton: HTMLButtonElement;
  rewindButton: HTMLButtonElement;
  loopButton: HTMLButtonElement;
  recordButton: HTMLButtonElement;
  bpmDownButton: HTMLButtonElement;
  bpmUpButton: HTMLButtonElement;
  volKnob: DesktopVolumeKnobHandle;
  dispose: () => void;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isVisible: () => boolean;
  setBpm: (bpm: number) => void;
  setTimeLabel: (label: string) => void;
  setBarBeat: (bar: number, beat: number) => void;
  setStep: (step: number, total: number) => void;
  setLoopActive: (active: boolean) => void;
  resetPosition: () => void;
  setVol: (pct: number) => void;
  flashBeatLed: () => void;
}

function DesktopTransportBar(): React.JSX.Element {
  return (
    <div className="bb-transport" id="bb-transport-bar">
      <div className="bb-transport__info">
        <span aria-hidden="true" className="bb-transport__beat-led" title="Beat indicator" />
        <div className="bb-transport__lcd"><span className="bb-transport__lcd-label">BPM</span><div className="bb-transport__lcd-screen"><span className="bb-transport__lcd-ghost">000</span><span className="bb-transport__lcd-value" data-lcd="bpm">120</span></div></div>
        <div className="bb-transport__lcd bb-transport__lcd--pri-4"><span className="bb-transport__lcd-label">TIME</span><div className="bb-transport__lcd-screen"><span className="bb-transport__lcd-ghost">00:00</span><span className="bb-transport__lcd-value" data-lcd="time">00:00</span></div></div>
        <div className="bb-transport__lcd bb-transport__lcd--pri-1"><span className="bb-transport__lcd-label">BAR:BT</span><div className="bb-transport__lcd-screen"><span className="bb-transport__lcd-ghost">000:0</span><span className="bb-transport__lcd-value" data-lcd="bar-beat">001:1</span></div></div>
        <div className="bb-transport__lcd bb-transport__lcd--pri-1"><span className="bb-transport__lcd-label">STEP</span><div className="bb-transport__lcd-screen"><span className="bb-transport__lcd-ghost">000/000</span><span className="bb-transport__lcd-value" data-lcd="step">001/001</span></div></div>
        <div className="bb-transport__lcd bb-transport__lcd--pri-2" data-lcd-wrap="loop"><span className="bb-transport__lcd-label">LOOP</span><div className="bb-transport__lcd-screen"><span className="bb-transport__lcd-ghost">000</span><span className="bb-transport__lcd-value" data-lcd="loop">0FF</span></div></div>
      </div>

      <div className="bb-transport__separator bb-transport__separator--pri-3" />
      <div className="bb-transport__nudge-wrap bb-transport__nudge-wrap--pri-3">
        <span className="bb-transport__nudge-label">BPM</span>
        <div className="bb-transport__nudge-row">
          <button aria-label="BPM -1" className="bb-transport__nudge-btn" data-button="bpm-down" title="BPM -1" type="button">«</button>
          <button aria-label="BPM +1" className="bb-transport__nudge-btn" data-button="bpm-up" title="BPM +1" type="button">»</button>
        </div>
      </div>

      <div className="bb-transport__separator" />
      <button aria-label="Rewind to start" className="bb-transport__btn bb-transport__btn--rewind bb-transport__btn--pri-4" data-button="rewind" title="Rewind to start" type="button">⏮</button>
      <button aria-label="Play current song (F5 in desktop)" className="bb-transport__btn bb-transport__btn--play" data-button="play" title="Play current song (F5 in desktop)" type="button">▶ Play</button>
      <button aria-label="Pause playback" className="bb-transport__btn bb-transport__btn--pause bb-transport__btn--pri-5" data-button="pause" title="Pause playback" type="button">⏸ Pause</button>
      <button aria-label="Stop playback (F8 in desktop)" className="bb-transport__btn bb-transport__btn--stop" data-button="stop" title="Stop playback (F8 in desktop)" type="button">⏹ Stop</button>
      <button aria-label="Apply & re-play (Ctrl+Enter)" className="bb-transport__btn bb-transport__btn--apply bb-transport__btn--pri-5" data-button="apply" title="Apply & re-play (Ctrl+Enter)" type="button">↻ Apply</button>
      <button aria-label="Toggle live-play mode" className="bb-transport__btn bb-transport__btn--live bb-live-btn bb-transport__btn--pri-5" data-button="live" title="Toggle live-play mode" type="button">⚡ Live</button>
      <button aria-label="Toggle loop playback" className="bb-transport__btn bb-transport__btn--loop bb-loop-btn bb-transport__btn--pri-2" data-button="loop" title="Toggle loop playback" type="button">⟳ Loop</button>
      <button aria-label="Arm recording (coming soon)" className="bb-transport__btn bb-transport__btn--record" data-button="record" disabled title="Arm recording (coming soon)" type="button">● Rec</button>

      <div className="bb-transport__separator bb-transport__separator--post-record" />
      <div className="bb-transport__vol-group">
        <div data-volume-knob-host />
        <div className="bb-transport__separator bb-transport__separator--vol-lcd" />
        <div className="bb-transport__lcd bb-transport__lcd--vol"><span className="bb-transport__lcd-label">VOL</span><div className="bb-transport__lcd-screen"><span className="bb-transport__lcd-ghost">000%</span><span className="bb-transport__lcd-value" data-lcd="vol">100%</span></div></div>
      </div>
    </div>
  );
}

function required<T extends HTMLElement>(host: HTMLElement, selector: string): T {
  const el = host.querySelector<T>(selector);
  if (!el) throw new Error(`Desktop transport bar element missing: ${selector}`);
  return el;
}

export function createDesktopTransportBar(container: HTMLElement): DesktopTransportBarHandle {
  const host = document.createElement('div');
  container.insertBefore(host, container.firstChild ?? null);

  host.innerHTML = renderToStaticMarkup(<DesktopTransportBar />);

  const el = required<HTMLElement>(host, '#bb-transport-bar');
  const bpmEl = required<HTMLElement>(host, '[data-lcd="bpm"]');
  const timeEl = required<HTMLElement>(host, '[data-lcd="time"]');
  const barBeatEl = required<HTMLElement>(host, '[data-lcd="bar-beat"]');
  const stepEl = required<HTMLElement>(host, '[data-lcd="step"]');
  const loopEl = required<HTMLElement>(host, '[data-lcd="loop"]');
  const loopLcd = required<HTMLElement>(host, '[data-lcd-wrap="loop"]');
  const volEl = required<HTMLElement>(host, '[data-lcd="vol"]');
  const beatLed = required<HTMLElement>(host, '.bb-transport__beat-led');
  const volKnobHost = required<HTMLElement>(host, '[data-volume-knob-host]');
  const volKnob = new RotaryKnob(28);
  volKnob.el.classList.add('bb-transport__vol-knob');
  volKnobHost.replaceWith(volKnob.el);

  const setVol = (pct: number) => {
    const volume = Math.max(0, Math.min(100, Math.round(pct)));
    volEl.textContent = `${String(volume).padStart(3, ' ')}%`;
    volKnob.setValue(volume);
  };

  return {
    el,
    playButton: required<HTMLButtonElement>(host, '[data-button="play"]'),
    pauseButton: required<HTMLButtonElement>(host, '[data-button="pause"]'),
    stopButton: required<HTMLButtonElement>(host, '[data-button="stop"]'),
    applyButton: required<HTMLButtonElement>(host, '[data-button="apply"]'),
    liveButton: required<HTMLButtonElement>(host, '[data-button="live"]'),
    rewindButton: required<HTMLButtonElement>(host, '[data-button="rewind"]'),
    loopButton: required<HTMLButtonElement>(host, '[data-button="loop"]'),
    recordButton: required<HTMLButtonElement>(host, '[data-button="record"]'),
    bpmDownButton: required<HTMLButtonElement>(host, '[data-button="bpm-down"]'),
    bpmUpButton: required<HTMLButtonElement>(host, '[data-button="bpm-up"]'),
    volKnob: {
      el: volKnob.el,
      onChange: (handler) => volKnob.onChange(handler),
      setValue: setVol,
      redraw: () => volKnob.redraw(),
    },
    dispose: () => {
      host.remove();
    },
    show: () => { el.style.display = ''; },
    hide: () => { el.style.display = 'none'; },
    toggle: () => { el.style.display = el.style.display === 'none' ? '' : 'none'; },
    isVisible: () => el.style.display !== 'none',
    setBpm: (bpm) => {
      bpmEl.textContent = String(bpm).padStart(3, '0');
    },
    setTimeLabel: (label) => {
      const prefix = 'Time: ';
      const raw = label.startsWith(prefix) ? label.slice(prefix.length) : label;
      const [mins, secs] = raw.split(':');
      timeEl.textContent = secs !== undefined ? `${mins.padStart(2, '0')}:${secs.padStart(2, '0')}` : raw;
    },
    setBarBeat: (bar, beat) => {
      barBeatEl.textContent = `${String(bar).padStart(3, '0')}:${beat}`;
    },
    setStep: (step, total) => {
      stepEl.textContent = `${String(Math.max(1, step)).padStart(3, '0')}/${String(Math.max(1, total)).padStart(3, '0')}`;
    },
    setLoopActive: (active) => {
      loopEl.textContent = active ? '0N ' : '0FF';
      loopLcd.classList.toggle('bb-transport__lcd--active', active);
    },
    resetPosition: () => {
      barBeatEl.textContent = '001:1';
      stepEl.textContent = '001/001';
      timeEl.textContent = '00:00';
    },
    setVol,
    flashBeatLed: () => {
      beatLed.classList.remove('bb-transport__beat-led--flash');
      void beatLed.offsetWidth;
      beatLed.classList.add('bb-transport__beat-led--flash');
    },
  };
}
