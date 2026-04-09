/**
 * RotaryKnob — a hardware-style canvas potentiometer.
 *
 * Visual design:
 *   - 270° arc sweep from 7:30 to 4:30 o'clock
 *   - Dark knob body with radial gradient highlight
 *   - Amber value arc on a dark track
 *   - White indicator dot showing current position
 *
 * Controls:
 *   - Drag up/down    — normal speed (~67 px = full range)
 *   - Shift + drag    — fine mode (~667 px = full range)
 *   - Scroll wheel    — ±5 % per notch
 *   - Shift + scroll  — ±1 % per notch
 *   - Arrow keys      — ±2 % (±5 % with Shift)
 *   - Page Up/Down    — ±10 %
 */
export class RotaryKnob {
  public readonly el: HTMLCanvasElement;

  private _value  = 100;          // 0–100
  private _cb?: (v: number) => void;

  // drag state
  private _dragging   = false;
  private _dragStartY = 0;
  private _dragStartV = 0;
  private _dragShift  = false;

  // tooltip overlay
  private _tooltip: HTMLElement;

  private readonly _SIZE: number;
  private readonly _DPR:  number;

  constructor(size = 44) {
    this._SIZE = size;
    this._DPR  = window.devicePixelRatio || 1;

    this.el = document.createElement('canvas');
    this.el.width  = Math.round(size * this._DPR);
    this.el.height = Math.round(size * this._DPR);
    this.el.style.width  = `${size}px`;
    this.el.style.height = `${size}px`;
    this.el.className = 'bb-knob';

    // ARIA slider
    this.el.setAttribute('role',          'slider');
    this.el.setAttribute('aria-label',    'Master volume');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    this.el.setAttribute('aria-valuenow', String(this._value));
    this.el.setAttribute('tabindex',      '0');
    this.el.title = 'Master volume — drag up/down or scroll\nHold Shift for fine control';

    // Tooltip shown while dragging
    this._tooltip = document.createElement('div');
    this._tooltip.className = 'bb-knob-tooltip';
    this._tooltip.setAttribute('aria-hidden', 'true');

    this._bindEvents();
    this._draw();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get value(): number { return Math.round(this._value); }

  /** Update the knob visually without firing the onChange callback. */
  setValue(v: number): void {
    this._value = Math.max(0, Math.min(100, v));
    this.el.setAttribute('aria-valuenow', String(Math.round(this._value)));
    this._draw();
  }

  /** Re-paint the knob (e.g. after a theme change). Does not fire onChange. */
  redraw(): void {
    this._draw();
  }

  /** Register a change listener fired when the user interacts. */
  onChange(cb: (value: number) => void): void {
    this._cb = cb;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _emit(): void {
    this._cb?.(Math.round(this._value));
  }

  private _adjust(delta: number): void {
    const next = Math.max(0, Math.min(100, this._value + delta));
    if (Math.round(next) === Math.round(this._value)) return;
    this._value = next;
    this.el.setAttribute('aria-valuenow', String(Math.round(this._value)));
    this._draw();
    this._emit();
  }

  private _bindEvents(): void {
    const el = this.el;

    // ── Vertical drag ──────────────────────────────────────────────────────
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragging   = true;
      this._dragShift  = e.shiftKey;
      this._dragStartY = e.clientY;
      this._dragStartV = this._value;
      // Attach tooltip to body so it floats above everything
      this._tooltip.textContent = `${Math.round(this._value)}%`;
      document.body.appendChild(this._tooltip);
      this._positionTooltip();
      e.preventDefault();
    });

    const onMove = (e: MouseEvent) => {
      if (!this._dragging) return;
      const speed = this._dragShift ? 0.15 : 1.5;   // fine: ~667px; normal: ~67px full range
      const dy   = this._dragStartY - e.clientY;
      const next = Math.max(0, Math.min(100, this._dragStartV + dy * speed));
      if (Math.round(next) === Math.round(this._value)) return;
      this._value = next;
      this.el.setAttribute('aria-valuenow', String(Math.round(this._value)));
      this._tooltip.textContent = `${Math.round(this._value)}%`;
      this._draw();
      this._emit();
    };

    const onUp = () => {
      if (!this._dragging) return;
      this._dragging = false;
      this._tooltip.remove();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);

    // ── Scroll wheel — ±5% normal, ±1% with Shift ─────────────────────────
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 5;
      this._adjust(e.deltaY < 0 ? step : -step);
    }, { passive: false });

    // ── Keyboard ───────────────────────────────────────────────────────────
    el.addEventListener('keydown', (e) => {
      const big = e.shiftKey ? 5 : 2;
      switch (e.key) {
        case 'ArrowUp':    case 'ArrowRight': e.preventDefault(); this._adjust(+big); break;
        case 'ArrowDown':  case 'ArrowLeft':  e.preventDefault(); this._adjust(-big); break;
        case 'PageUp':                        e.preventDefault(); this._adjust(+10);  break;
        case 'PageDown':                      e.preventDefault(); this._adjust(-10);  break;
        case 'Home':                          e.preventDefault(); this._adjust(-100); break;
        case 'End':                           e.preventDefault(); this._adjust(+100); break;
      }
    });
  }

  private _positionTooltip(): void {
    const r = this.el.getBoundingClientRect();
    this._tooltip.style.left = `${r.left + r.width / 2}px`;
    this._tooltip.style.top  = `${r.top - 6}px`;
  }

  private _draw(): void {
    const dpr  = this._DPR;
    const size = this._SIZE;
    const ctx  = this.el.getContext('2d')!;

    const isLight = document.documentElement.dataset['theme'] === 'light';

    ctx.save();
    ctx.clearRect(0, 0, size * dpr, size * dpr);
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;

    const outerR = size / 2 - 2;
    const ringR  = outerR - 1;       // value ring track centre
    const bodyR  = outerR - 6;       // knob face radius
    const trackW = 3.5;

    // 270° sweep: 7:30 → 4:30
    const MIN_ANG = (Math.PI * 3) / 4;
    const SWEEP   = (Math.PI * 3) / 2;
    const valAng  = MIN_ANG + (this._value / 100) * SWEEP;

    // ── Outer shadow ring (depth illusion) ────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    const shadowRing = ctx.createRadialGradient(cx, cy, outerR - 2, cx, cy, outerR + 1);
    shadowRing.addColorStop(0, 'rgba(0,0,0,0)');
    shadowRing.addColorStop(1, isLight ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.65)');
    ctx.strokeStyle = shadowRing;
    ctx.lineWidth   = 4;
    ctx.stroke();

    // ── Track groove (dark recess) ────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, MIN_ANG, MIN_ANG + SWEEP);
    ctx.strokeStyle = isLight ? '#b0aea8' : '#0d0d0d';
    ctx.lineWidth   = trackW + 2;
    ctx.lineCap     = 'butt';
    ctx.stroke();

    // Track inner hi-light (gives groove depth)
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, MIN_ANG, MIN_ANG + SWEEP);
    ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Value arc (bright amber) ──────────────────────────────────────────
    if (this._value > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, MIN_ANG, valAng);
      ctx.strokeStyle = isLight ? '#c07820' : '#e8b84b';
      ctx.lineWidth   = trackW;
      ctx.lineCap     = 'round';
      ctx.stroke();

      // Glow pass — wider + translucent
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, MIN_ANG, valAng);
      ctx.strokeStyle = isLight ? 'rgba(160,100,20,0.22)' : 'rgba(200,162,39,0.30)';
      ctx.lineWidth   = trackW + 4;
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    // ── Knob body — base shadow ───────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = isLight ? 'rgba(0,0,0,0.12)' : '#0a0a0a';
    ctx.fill();

    // Main body sphere — off-centre radial gradient for 3D pop
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR, 0, Math.PI * 2);
    const body = ctx.createRadialGradient(
      cx - bodyR * 0.35, cy - bodyR * 0.40, bodyR * 0.04,
      cx + bodyR * 0.10, cy + bodyR * 0.10, bodyR * 1.05
    );
    if (isLight) {
      body.addColorStop(0.00, '#f0eeea');  // bright specular centre
      body.addColorStop(0.18, '#d8d6d2');  // mid-tone
      body.addColorStop(0.60, '#b8b6b2');  // shaded face
      body.addColorStop(1.00, '#909090');  // edge shadow
    } else {
      body.addColorStop(0.00, '#6e6e6e');
      body.addColorStop(0.18, '#4a4a4a');
      body.addColorStop(0.60, '#252525');
      body.addColorStop(1.00, '#111111');
    }
    ctx.fillStyle = body;
    ctx.fill();

    // Specular highlight — small bright oval top-left
    ctx.beginPath();
    ctx.arc(cx - bodyR * 0.30, cy - bodyR * 0.32, bodyR * 0.22, 0, Math.PI * 2);
    const hilight = ctx.createRadialGradient(
      cx - bodyR * 0.36, cy - bodyR * 0.38, 0,
      cx - bodyR * 0.30, cy - bodyR * 0.32, bodyR * 0.22
    );
    hilight.addColorStop(0, isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.38)');
    hilight.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = hilight;
    ctx.fill();

    // Rim bevel — thin top-left bright arc, bottom-right dark arc
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR, Math.PI * 1.25, Math.PI * 0.25);  // top-left arc
    ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, bodyR, Math.PI * 0.25, Math.PI * 1.25);  // bottom-right arc
    ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.55)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Indicator line — recessed groove from centre to edge ──────────────
    const lineStart = bodyR * 0.25;
    const lineEnd   = bodyR * 0.86;
    // Shadow of line (slightly offset) for engraved look
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(valAng) * (lineStart + 0.8), cy + Math.sin(valAng) * (lineStart + 0.8));
    ctx.lineTo(cx + Math.cos(valAng) * (lineEnd   + 0.8), cy + Math.sin(valAng) * (lineEnd   + 0.8));
    ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.55)';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();
    // Bright line on top
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(valAng) * lineStart, cy + Math.sin(valAng) * lineStart);
    ctx.lineTo(cx + Math.cos(valAng) * lineEnd,   cy + Math.sin(valAng) * lineEnd);
    ctx.strokeStyle = isLight ? 'rgba(60,40,10,0.75)' : 'rgba(255,255,255,0.82)';
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';
    ctx.stroke();

    ctx.restore();
  }
}
