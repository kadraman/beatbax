import { useEffect, useState, type ReactNode } from 'react';
import type { ElectronAPI } from '../../../shared/electron-api';

const DEVTOOLS_LAUNCH_FLAG_HINT = 'To inspect this further, restart BeatBax with the --devtools launch flag.';

function getElectronApi(): Partial<ElectronAPI> | undefined {
  return (window as unknown as { electronAPI?: Partial<ElectronAPI> }).electronAPI;
}

export function FatalErrorScreen({ error }: { error: Error }): ReactNode {
  const [devToolsAllowed, setDevToolsAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    getElectronApi()?.getDevToolsState?.()
      .then((state) => {
        if (active) setDevToolsAllowed(state.allowed);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="desktop-fatal">
      <h1>BeatBax Desktop failed to start</h1>
      <pre>{error.message}</pre>
      <div className="desktop-fatal__actions">
        <button type="button" onClick={() => void getElectronApi()?.openLogsFolder?.()}>
          Open logs folder
        </button>
        {devToolsAllowed && (
          <button type="button" onClick={() => getElectronApi()?.toggleDevTools?.()}>
            Open developer tools
          </button>
        )}
      </div>
      {!devToolsAllowed && <p>{DEVTOOLS_LAUNCH_FLAG_HINT}</p>}
    </div>
  );
}
