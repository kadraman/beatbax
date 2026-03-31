// Minimal HTMLCanvasElement.getContext mock for jsdom used in Jest tests.
// Avoids "Not implemented: HTMLCanvasElement.prototype.getContext" errors.
(() => {
  try {
    const proto = (HTMLCanvasElement as any).prototype as any;
    // If jsdom provides getContext that throws, replace it with a safe stub.
    proto.getContext = proto.getContext || function () { /* replaced below */ };
    proto.getContext = function (this: HTMLCanvasElement, _type: string) {
      // Return a lightweight 2D context stub implementing methods used by tests.
      const ctx: any = {
        // basic drawing
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        bezierCurveTo: () => {},
        arc: () => {},
        stroke: () => {},
        fill: () => {},
        rect: () => {},
        // transforms
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        setTransform: () => {},
        // text
        fillText: () => {},
        strokeText: () => {},
        measureText: () => ({ width: 0 }),
        // image
        drawImage: () => {},
        createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
        // style/state
        strokeStyle: '#000',
        fillStyle: '#000',
        lineWidth: 1,
        globalAlpha: 1,
        // gradients
        createLinearGradient: () => ({ addColorStop: () => {} }),
      };
      // attach a reference to the canvas
      ctx.canvas = this;
      return ctx;
    };
  } catch (e) {
    // swallow to avoid breaking test harness
  }
})();
