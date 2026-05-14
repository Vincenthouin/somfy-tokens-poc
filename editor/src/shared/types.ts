// W3C Design Token types
export type TokenType =
  | 'color'
  | 'dimension'
  | 'fontFamily'
  | 'fontWeight'
  | 'fontSize'
  | 'lineHeight'
  | 'letterSpacing'
  | 'duration'
  | 'cubicBezier'
  | 'shadow'
  | 'typography'
  | 'border'
  | 'string'
  | 'number';

export interface Token {
  $value: any;
  $type?: TokenType;
  $description?: string;
  // Light/dark mode support
  $extensions?: {
    modes?: {
      light?: any;
      dark?: any;
    };
  };
}

export interface TokenGroup {
  [key: string]: Token | TokenGroup;
}

export interface TokenFile {
  primitives?: TokenGroup;
  semantic?: TokenGroup;
  composite?: TokenGroup;
  component?: TokenGroup;
  [key: string]: any;
}

// Flattened token for UI display
export interface FlatToken {
  path: string[];           // e.g. ['primitives', 'color', 'blue', '500']
  fullName: string;         // e.g. 'primitives.color.blue.500'
  layer: string;            // 'primitives' | 'semantic' | 'composite' | 'component'
  category: string;         // 'color' | 'dimension' | ...
  type?: TokenType;
  value: any;
  description?: string;
  modes?: {
    light?: any;
    dark?: any;
  };
}

// Edit tracking
export interface TokenEdit {
  originalPath: string[];   // path before any rename
  currentPath: string[];    // path after renames
  originalValue: any;
  currentValue: any;
  renamed: boolean;
  modified: boolean;
}

// GitHub config
export interface GitHubConfig {
  pat: string;
  owner: string;
  repo: string;
  branch: string;           // base branch (usually 'main')
  filePath: string;         // path to JSON file in repo
}

// ---- Projects ----

export type ProjectSource = 'github' | 'local';

export interface Project {
  id: string;
  name: string;
  source: ProjectSource;
  github?: GitHubConfig;        // when source === 'github'
  localTokens?: TokenFile;      // when source === 'local' (in-memory persisted via electron-store)
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  source: ProjectSource;
  createdAt: number;
  updatedAt: number;
  // Repo info shown in the list for GitHub projects
  repoLabel?: string;
}

// Commit info from history
export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

// IPC channel names
export const IPC = {
  // Legacy (kept for the boot-time migration only)
  GET_CONFIG: 'config:get',
  SAVE_CONFIG: 'config:save',
  // Tokens (project-scoped)
  LOAD_TOKENS: 'tokens:load',
  CREATE_PR: 'tokens:create-pr',
  SAVE_LOCAL: 'tokens:save-local',
  EXPORT_JSON: 'tokens:export-json',
  IMPORT_JSON: 'tokens:import-json',
  GET_HISTORY: 'tokens:get-history',
  GET_FILE_AT_COMMIT: 'tokens:get-file-at-commit',
  REVERT_TO_COMMIT: 'tokens:revert-to-commit',
  // Projects
  LIST_PROJECTS: 'projects:list',
  CREATE_PROJECT: 'projects:create',
  UPDATE_PROJECT: 'projects:update',
  DELETE_PROJECT: 'projects:delete',
  GET_CURRENT_PROJECT: 'projects:get-current',
  SET_CURRENT_PROJECT: 'projects:set-current',
  TEST_GITHUB: 'projects:test-github',
  MIGRATE_TO_GITHUB: 'projects:migrate-to-github',
  // Misc
  OPEN_EXTERNAL: 'shell:open-external',
} as const;
