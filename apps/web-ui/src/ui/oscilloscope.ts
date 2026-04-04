/**
 * Oscilloscope — live waveform canvas strip.
 *
 * Displays time-domain audio data from a Web Audio AnalyserNode at ~60 fps.
 * Shows a flat amber centre line when idle (no analyser attached or silence).
 *
 * Usage:
 *   const scope = new Oscilloscope();
 *   transportBar.el.appendChild(scope.el);
 *   scope.start();
 *   // later, once playback is running:
 *   scope.setAnalyser(playbackManager.getMasterAnalyser());
 */
export class Oscilloscope {
  readonly el: HTMLCanvasElement;

  private _analyser: AnalyserNode | null = null;
  private _buf: Float32Array<ArrayBuffer> | null = null;
  private _raf = 0;
  private _dpr = 1;

  constructor() {
    const c = document.createElement('canvas');
    c.className = 'bb-scope';
    c.setAttribute('aria-hidden', 'true');
    this.el = c;

    this._dpr = window.devicePixelRatio || 1;

    // Sync physical pixel size whenever the CSS box changes.
    const ro = new ResizeObserver(() => this._syncSize());
    ro.observe(c);
  }

  /** Attach (or detach) an AnalyserNode. Pass null to return to idle flat-line. */
  setAnalyser(node: AnalyserNode | null): void {
    if (node === this._analyser) return;
    this._analyser = node;
    this._buf = node ? new Float32Array(node.fftSize) as Float32Array<ArrayBuffer> : null;
  }

  /** Start the RAF draw loop. Safe to call multiple times. */
  start(): void {
    if (this._raf) return;
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this._draw();
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** Stop the RAF draw loop (call when the canvas is removed from DOM). */
  stop(): void {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _syncSize(): void {
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    if (w > 0 && h > 0) {
      this.el.width  = Math.round(w * dpr);
      this.el.height = Math.round(h * dpr);
    }
  }

  private _draw(): void {
    const canvas = this.el;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    // ── Background — matches LCD panel colour ─────────────────────────
    ctx.fillStyle = '#0b130b';
    ctx.fillRect(0, 0, w, h);

    // ── Centre grid line ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();

    if (!this._analyser || !this._buf) {
      // Idle: dim flat centre line
      ctx.strokeStyle = 'rgba(232,184,75,0.30)';
      ctx.lineWidth = Math.max(1, this._dpr * 0.75);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();
      return;
    }

    this._analyser.getFloatTimeDomainData(this._buf);
    const buf = this._buf;
    const n   = buf.length;

    // ── Glow pass (wider, translucent) ───────────────────────────────────
    ctx.strokeStyle = 'rgba(232,184,75,0.18)';
    ctx.lineWidth   = Math.max(3, this._dpr * 3);
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = ((1 - buf[i]) * 0.5) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ── Sharp line ────────────────────────────────────────────────────────
    ctx.strokeStyle = '#e8b84b';
    ctx.lineWidth   = Math.max(1, this._dpr);
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = ((1 - buf[i]) * 0.5) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
