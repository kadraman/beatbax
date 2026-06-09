import { useEffect, useRef, useState } from 'react';

interface DesktopTitleBarProps {
  menuHostRef: React.RefObject<HTMLDivElement | null>;
}

export function DesktopTitleBar({ menuHostRef }: DesktopTitleBarProps): React.JSX.Element {
  const platform = window.electronAPI.getPlatform();
  const showWindowControls = platform !== 'darwin';
  const barRef = useRef<HTMLDivElement>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.electronAPI.queryWindowState().then((state) => setMaximized(state.maximized));
    return window.electronAPI.onWindowStateChanged((state) => setMaximized(state.maximized));
  }, []);

  return (
    <div
      ref={barRef}
      className={`desktop-title-bar${platform === 'darwin' ? ' desktop-title-bar--mac' : ''}`}
    >
      <div ref={menuHostRef} className="desktop-title-bar__menu-host" />

      <div
        className="desktop-title-bar__drag"
        onDoubleClick={() => {
          if (showWindowControls) window.electronAPI.toggleMaximizeWindow();
        }}
      />

      {showWindowControls ? (
        <div className="desktop-title-bar__controls">
          <button
            type="button"
            className="desktop-title-bar__control desktop-title-bar__control--minimize"
            aria-label="Minimize"
            title="Minimize"
            tabIndex={-1}
            onClick={() => window.electronAPI.minimizeWindow()}
          />
          <button
            type="button"
            className={`desktop-title-bar__control desktop-title-bar__control--maximize${maximized ? ' desktop-title-bar__control--restore' : ''}`}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            title={maximized ? 'Restore' : 'Maximize'}
            tabIndex={-1}
            onClick={() => window.electronAPI.toggleMaximizeWindow()}
          />
          <button
            type="button"
            className="desktop-title-bar__control desktop-title-bar__control--close"
            aria-label="Close"
            title="Close"
            tabIndex={-1}
            onClick={() => window.electronAPI.closeWindow()}
          />
        </div>
      ) : null}
    </div>
  );
}
