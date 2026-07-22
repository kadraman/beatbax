/**
 * Progressively hide lower-priority transport controls until the main
 * cluster fits the available width. Volume stays pinned outside `.bb-transport__main`.
 *
 * Sets `data-fit-level` on the transport root (0–5). Matching CSS hides
 * `.bb-transport__*--pri-N` elements when the level is ≥ N.
 */
export function attachTransportBarFit(transportEl: HTMLElement): () => void {
  const main = transportEl.querySelector<HTMLElement>('.bb-transport__main');
  if (!main) return () => {};

  let raf = 0;

  const overflows = (): boolean =>
    main.scrollWidth > main.clientWidth + 1
    || transportEl.scrollWidth > transportEl.clientWidth + 1;

  const measure = (): void => {
    raf = 0;
    // Skip until laid out — a 0-width pass would collapse everything to level 5.
    if (main.clientWidth === 0 || transportEl.clientWidth === 0) return;

    let level = 0;
    transportEl.dataset.fitLevel = '0';
    // Force layout after clearing so scrollWidth reflects the full control set.
    void main.offsetWidth;
    while (level < 5 && overflows()) {
      level += 1;
      transportEl.dataset.fitLevel = String(level);
      void main.offsetWidth;
    }
  };

  const schedule = (): void => {
    if (raf) return;
    raf = requestAnimationFrame(measure);
  };

  const ro = new ResizeObserver(schedule);
  ro.observe(transportEl);
  ro.observe(main);

  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  void fonts?.ready?.then(schedule);
  schedule();

  return () => {
    ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    delete transportEl.dataset.fitLevel;
  };
}
