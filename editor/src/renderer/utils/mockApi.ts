/**
 * Mock implementation of the Electron preload API for pure-browser runs (`npm run dev:vite`).
 * Backs everything with localStorage: project list, current project, local tokens.
 * GitHub-source projects fall back to the demo `/somfy-tokens.json` since we don't have
 * a PAT-aware backend in browser mode.
 */
import {
  GitHubConfig,
  Project,
  ProjectSource,
  ProjectSummary,
  TokenFile,
} from '../../shared/types';

const PROJECTS_KEY = 'mock_projects';
const CURRENT_KEY = 'mock_current_project_id';

function uuid(): string {
  // Browser-safe UUID; crypto.randomUUID is available in modern browsers
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readProjects(): Project[] {
  const raw = localStorage.getItem(PROJECTS_KEY);
  return raw ? JSON.parse(raw) : [];
}
function writeProjects(projects: Project[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}
function getCurrentId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}
function setCurrentId(id: string | null) {
  if (id == null) localStorage.removeItem(CURRENT_KEY);
  else localStorage.setItem(CURRENT_KEY, id);
}

function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    source: p.source,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    repoLabel: p.github ? `${p.github.owner}/${p.github.repo} · ${p.github.branch}` : undefined,
  };
}

export function installMockApi() {
  if ((window as any).api) return;
  (window as any).api = {
    // Legacy
    getConfig: async (): Promise<GitHubConfig | null> => null,
    saveConfig: async () => ({ ok: true }),

    // Projects
    listProjects: async (): Promise<ProjectSummary[]> => readProjects().map(summarize),
    getCurrentProject: async (): Promise<Project | null> => {
      const id = getCurrentId();
      if (!id) return null;
      return readProjects().find((p) => p.id === id) || null;
    },
    setCurrentProject: async (id: string | null) => {
      setCurrentId(id);
      return { ok: true };
    },
    createProject: async (input: {
      name: string;
      source: ProjectSource;
      github?: GitHubConfig;
      localTokens?: TokenFile;
    }): Promise<Project> => {
      const now = Date.now();
      const project: Project = {
        id: uuid(),
        name: input.name.trim() || 'Untitled',
        source: input.source,
        github: input.source === 'github' ? input.github : undefined,
        localTokens: input.source === 'local' ? input.localTokens || {} : undefined,
        createdAt: now,
        updatedAt: now,
      };
      const list = readProjects();
      list.push(project);
      writeProjects(list);
      setCurrentId(project.id);
      return project;
    },
    updateProject: async (input: {
      id: string;
      name?: string;
      github?: GitHubConfig;
      localTokens?: TokenFile;
    }): Promise<Project> => {
      const list = readProjects();
      const idx = list.findIndex((p) => p.id === input.id);
      if (idx < 0) throw new Error('Project not found');
      list[idx] = {
        ...list[idx],
        name: input.name !== undefined ? input.name : list[idx].name,
        github: input.github !== undefined ? input.github : list[idx].github,
        localTokens: input.localTokens !== undefined ? input.localTokens : list[idx].localTokens,
        updatedAt: Date.now(),
      };
      writeProjects(list);
      return list[idx];
    },
    deleteProject: async (id: string) => {
      const list = readProjects().filter((p) => p.id !== id);
      writeProjects(list);
      if (getCurrentId() === id) setCurrentId(null);
      return { ok: true };
    },
    testGithub: async () => ({ ok: false, fileExists: false, error: 'Indisponible en mode browser.' }),
    migrateToGithub: async () => {
      throw new Error('Migration vers GitHub indisponible en mode browser. Lance l\'app via Electron.');
    },

    // Tokens
    loadTokens: async (projectId?: string): Promise<TokenFile> => {
      const id = projectId || getCurrentId();
      const project = id ? readProjects().find((p) => p.id === id) : null;
      if (!project) return {};
      if (project.source === 'local') return project.localTokens || {};
      // GitHub-source : in browser mode we fall back to the bundled sample
      const res = await fetch('/somfy-tokens.json');
      if (!res.ok) throw new Error('Browser mode : sample tokens unavailable for GitHub project');
      return res.json();
    },
    saveLocal: async (payload: { projectId?: string; tokens: TokenFile }) => {
      const list = readProjects();
      const id = payload.projectId || getCurrentId();
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error('Project not found');
      list[idx] = { ...list[idx], localTokens: payload.tokens, updatedAt: Date.now() };
      writeProjects(list);
      return { ok: true };
    },
    createPR: async () => {
      throw new Error('Création de PR indisponible en mode browser. Lance l\'app via Electron.');
    },
    exportJson: async (payload: { tokens: TokenFile; suggestedName?: string }) => {
      const blob = new Blob([JSON.stringify(payload.tokens, null, 2) + '\n'], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.suggestedName || 'tokens.json';
      a.click();
      URL.revokeObjectURL(url);
      return { canceled: false, filePath: payload.suggestedName };
    },
    importJson: async (): Promise<{ canceled: boolean; filePath?: string; tokens?: TokenFile }> => {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve({ canceled: true });
            return;
          }
          try {
            const text = await file.text();
            const tokens = JSON.parse(text);
            resolve({ canceled: false, filePath: file.name, tokens });
          } catch (e: any) {
            alert(`JSON invalide : ${e.message}`);
            resolve({ canceled: true });
          }
        };
        input.click();
      });
    },
    getHistory: async () => [],
    getFileAtCommit: async () => ({}),
    revertToCommit: async () => {
      throw new Error('Revert indisponible en mode browser.');
    },

    openExternal: async (url: string) => {
      window.open(url, '_blank');
    },
  };
  console.info('[mock-api] Browser mode: window.api stubbed (projects + tokens in localStorage).');
}
