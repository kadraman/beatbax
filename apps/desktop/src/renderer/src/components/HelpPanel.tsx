export function HelpPanel(): React.JSX.Element {
  return (
    <section className="panel-card">
      <div className="panel-card__header">Desktop roadmap</div>
      <div className="panel-card__body">
        <p>This first desktop slice focuses on native file I/O, editor bootstrapping, playback, and distribution plumbing.</p>
        <ul>
          <li>Native menu actions mirror the planned desktop-first workflow.</li>
          <li>The renderer already runs with the <code>desktop-full</code> client profile.</li>
          <li>Visualizer, channel mixer, export UI, and richer panels will build on this shell next.</li>
        </ul>
      </div>
    </section>
  );
}
