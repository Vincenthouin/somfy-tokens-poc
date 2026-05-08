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
  GET_CONFIG: 'config:get',
  SAVE_CONFIG: 'config:save',
  LOAD_TOKENS: 'tokens:load',
  CREATE_PR: 'tokens:create-pr',
  GET_HISTORY: 'tokens:get-history',
  GET_FILE_AT_COMMIT: 'tokens:get-file-at-commit',
  REVERT_TO_COMMIT: 'tokens:revert-to-commit',
  OPEN_EXTERNAL: 'shell:open-external',
} as const;
