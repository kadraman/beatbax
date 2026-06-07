export const IPC_CHANNELS = {
  OPEN_FILE: 'desktop:open-file',
  SAVE_FILE: 'desktop:save-file',
  WRITE_FILE_SYNC: 'desktop:write-file-sync',
  GET_RECENT_FILES: 'desktop:get-recent-files',
  ADD_RECENT_FILE: 'desktop:add-recent-file',
  GET_VERSION: 'desktop:get-version',
  MENU_ACTION: 'desktop:menu-action',
  FILE_OPENED: 'desktop:file-opened',
  FILE_OPENED_REQUEST: 'desktop:file-opened-request',
} as const;
