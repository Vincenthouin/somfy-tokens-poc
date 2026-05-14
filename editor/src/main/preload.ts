import { contextBridge, ipcRenderer } from 'electron';

// Inline IPC channel names — preload sandbox can't resolve relative imports
const IPC = {
  GET_CONFIG: 'config:get',
  SAVE_CONFIG: 'config:save',
  LOAD_TOKENS: 'tokens:load',
  CREATE_PR: 'tokens:create-pr',
  SAVE_LOCAL: 'tokens:save-local',
  EXPORT_JSON: 'tokens:export-json',
  IMPORT_JSON: 'tokens:import-json',
  GET_HISTORY: 'tokens:get-history',
  GET_FILE_AT_COMMIT: 'tokens:get-file-at-commit',
  REVERT_TO_COMMIT: 'tokens:revert-to-commit',
  LIST_PROJECTS: 'projects:list',
  CREATE_PROJECT: 'projects:create',
  UPDATE_PROJECT: 'projects:update',
  DELETE_PROJECT: 'projects:delete',
  GET_CURRENT_PROJECT: 'projects:get-current',
  SET_CURRENT_PROJECT: 'projects:set-current',
  TEST_GITHUB: 'projects:test-github',
  MIGRATE_TO_GITHUB: 'projects:migrate-to-github',
  OPEN_EXTERNAL: 'shell:open-external',
};

contextBridge.exposeInMainWorld('api', {
  // Legacy
  getConfig: () => ipcRenderer.invoke(IPC.GET_CONFIG),
  saveConfig: (config: any) => ipcRenderer.invoke(IPC.SAVE_CONFIG, config),

  // Projects
  listProjects: () => ipcRenderer.invoke(IPC.LIST_PROJECTS),
  getCurrentProject: () => ipcRenderer.invoke(IPC.GET_CURRENT_PROJECT),
  setCurrentProject: (id: string | null) => ipcRenderer.invoke(IPC.SET_CURRENT_PROJECT, id),
  createProject: (input: any) => ipcRenderer.invoke(IPC.CREATE_PROJECT, input),
  updateProject: (input: any) => ipcRenderer.invoke(IPC.UPDATE_PROJECT, input),
  deleteProject: (id: string) => ipcRenderer.invoke(IPC.DELETE_PROJECT, id),
  testGithub: (config: any) => ipcRenderer.invoke(IPC.TEST_GITHUB, config),
  migrateToGithub: (payload: any) => ipcRenderer.invoke(IPC.MIGRATE_TO_GITHUB, payload),

  // Tokens (project-scoped — projectId optional, defaults to current)
  loadTokens: (projectId?: string) => ipcRenderer.invoke(IPC.LOAD_TOKENS, projectId),
  saveLocal: (payload: any) => ipcRenderer.invoke(IPC.SAVE_LOCAL, payload),
  createPR: (payload: any) => ipcRenderer.invoke(IPC.CREATE_PR, payload),
  exportJson: (payload: any) => ipcRenderer.invoke(IPC.EXPORT_JSON, payload),
  importJson: () => ipcRenderer.invoke(IPC.IMPORT_JSON),
  getHistory: (payload: any) => ipcRenderer.invoke(IPC.GET_HISTORY, payload),
  getFileAtCommit: (payload: any) => ipcRenderer.invoke(IPC.GET_FILE_AT_COMMIT, payload),
  revertToCommit: (payload: any) => ipcRenderer.invoke(IPC.REVERT_TO_COMMIT, payload),

  // Misc
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
});
