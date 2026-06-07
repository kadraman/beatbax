export interface OutputEntry {
  id: number;
  tone: 'info' | 'warning' | 'error';
  message: string;
}

interface OutputPanelProps {
  title: string;
  entries: OutputEntry[];
}

export function OutputPanel({ title, entries }: OutputPanelProps): React.JSX.Element {
  return (
    <section className="panel-card">
      <div className="panel-card__header">{title}</div>
      <div className="panel-card__body panel-card__body--list">
        {entries.length === 0 ? <p>No messages yet.</p> : null}
        {entries.map((entry) => (
          <div key={entry.id} className={`log-entry log-entry--${entry.tone}`}>
            {entry.message}
          </div>
        ))}
      </div>
    </section>
  );
}
