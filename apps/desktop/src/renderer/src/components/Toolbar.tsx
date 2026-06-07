interface ToolbarProps {
  documentName: string;
  isDirty: boolean;
  version: string;
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onVerify(): void;
}

export function Toolbar({ documentName, isDirty, version, onNew, onOpen, onSave, onSaveAs, onVerify }: ToolbarProps): React.JSX.Element {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <div>
          <strong>BeatBax Desktop</strong>
          <span>{documentName}{isDirty ? ' • modified' : ''}</span>
        </div>
        <small>v{version}</small>
      </div>
      <div className="toolbar__actions">
        <button type="button" onClick={onNew}>New</button>
        <button type="button" onClick={onOpen}>Open</button>
        <button type="button" onClick={onSave}>Save</button>
        <button type="button" onClick={onSaveAs}>Save As</button>
        <button type="button" onClick={onVerify}>Verify</button>
      </div>
    </header>
  );
}
