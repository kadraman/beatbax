/**
 * Electron wraps errors thrown by `ipcMain.handle` handlers as
 * "Error invoking remote method '<channel>': Error: <message>".
 * Returns just the handler's message for display to users.
 */
export function stripIpcErrorPrefix(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}
