import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channel names — preload sandbox can't resolve relative imports
const IPC = {
  GET_CONFIG: 'config:get',
  SAVE_CONFIG: 'config:save',
  LOAD_TOKENS: 'tokens:load',
  CREATE_PR: 'tokens:create-pr',
  GET_HISTORY: 'tokens:get-history',
  GET_FILE_AT_COMMIT: 'tokens:get-file-at-commit',
  REVERT_TO_COMMIT: 'tokens:revert-to-commit',
  OPEN_EXTERNAL: 'shell:open-external',
};

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke(IPC.GET_CONFIG),
  saveConfig: (config: any) => ipcRenderer.invoke(IPC.SAVE_CONFIG, config),
  loadTokens: () => ipcRenderer.invoke(IPC.LOAD_TOKENS),
  createPR: (payload: any) => ipcRenderer.invoke(IPC.CREATE_PR, payload),
  getHistory: (limit?: number) => ipcRenderer.invoke(IPC.GET_HISTORY, limit),
  getFileAtCommit: (sha: string) => ipcRenderer.invoke(IPC.GET_FILE_AT_COMMIT, sha),
  revertToCommit: (payload: any) => ipcRenderer.invoke(IPC.REVERT_TO_COMMIT, payload),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
});
