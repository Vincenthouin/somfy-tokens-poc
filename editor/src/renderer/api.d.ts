import {
  GitHubConfig,
  TokenFile,
  Project,
  ProjectSummary,
  ProjectSource,
  CommitInfo,
} from '../shared/types';

declare global {
  interface Window {
    api: {
      // Legacy
      getConfig: () => Promise<GitHubConfig | null>;
      saveConfig: (c: GitHubConfig) => Promise<{ ok: boolean }>;

      // Projects
      listProjects: () => Promise<ProjectSummary[]>;
      getCurrentProject: () => Promise<Project | null>;
      setCurrentProject: (id: string | null) => Promise<{ ok: boolean }>;
      createProject: (input: {
        name: string;
        source: ProjectSource;
        github?: GitHubConfig;
        localTokens?: TokenFile;
      }) => Promise<Project>;
      updateProject: (input: {
        id: string;
        name?: string;
        github?: GitHubConfig;
        localTokens?: TokenFile;
      }) => Promise<Project>;
      deleteProject: (id: string) => Promise<{ ok: boolean }>;
      testGithub: (
        config: GitHubConfig
      ) => Promise<{ ok: boolean; fileExists: boolean; error?: string }>;
      migrateToGithub: (payload: {
        projectId: string;
        github: GitHubConfig;
        tokens: TokenFile;
        message?: string;
      }) => Promise<{ url: string; number: number; branch: string; project: Project }>;

      // Tokens (project-scoped — projectId optional, defaults to current)
      loadTokens: (projectId?: string) => Promise<TokenFile>;
      saveLocal: (payload: { projectId?: string; tokens: TokenFile }) => Promise<{ ok: boolean }>;
      createPR: (payload: {
        projectId?: string;
        tokens: TokenFile;
        message: string;
        description?: string;
      }) => Promise<{ url: string; number: number; branch: string }>;
      exportJson: (payload: {
        projectId?: string;
        tokens: TokenFile;
        suggestedName?: string;
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      importJson: () => Promise<{ canceled: boolean; filePath?: string; tokens?: TokenFile }>;
      getHistory: (payload?: { projectId?: string; limit?: number }) => Promise<CommitInfo[]>;
      getFileAtCommit: (payload: { projectId?: string; sha: string }) => Promise<TokenFile>;
      revertToCommit: (payload: {
        projectId?: string;
        sha: string;
        message: string;
      }) => Promise<{ url: string; number: number; branch: string }>;

      // Misc
      openExternal: (url: string) => Promise<void>;
    };
  }
}

export {};
