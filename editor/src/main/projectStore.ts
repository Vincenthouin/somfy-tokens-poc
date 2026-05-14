import Store from 'electron-store';
import { randomUUID } from 'crypto';
import {
  GitHubConfig,
  Project,
  ProjectSource,
  ProjectSummary,
  TokenFile,
} from '../shared/types';

interface StoreSchema {
  // Legacy field — preserved for one-time migration
  github: GitHubConfig | null;
  // New multi-project state
  projects: Project[];
  currentProjectId: string | null;
}

const store = new Store<StoreSchema>({
  defaults: {
    github: null,
    projects: [],
    currentProjectId: null,
  },
});

/**
 * Migrate a legacy single-config setup to a "Default GitHub project".
 * Runs once on every boot — idempotent: if a project already references the same repo,
 * we leave it alone.
 */
export function migrateLegacyConfig() {
  const legacy = store.get('github');
  const projects = store.get('projects');
  if (!legacy || !legacy.pat) return; // nothing to migrate
  if (projects.length > 0) return;    // already migrated or user started fresh

  const now = Date.now();
  const project: Project = {
    id: randomUUID(),
    name: `${legacy.owner}/${legacy.repo}`,
    source: 'github',
    github: legacy,
    createdAt: now,
    updatedAt: now,
  };
  store.set('projects', [project]);
  store.set('currentProjectId', project.id);
  // Keep `github` key as a fallback for now — could be cleared after a few releases.
}

// ---- CRUD ----

export function listProjects(): ProjectSummary[] {
  return store.get('projects').map(summarize);
}

export function getProject(id: string): Project | null {
  return store.get('projects').find((p) => p.id === id) || null;
}

export function getCurrentProjectId(): string | null {
  return store.get('currentProjectId');
}

export function setCurrentProjectId(id: string | null): void {
  store.set('currentProjectId', id);
}

interface CreateProjectInput {
  name: string;
  source: ProjectSource;
  github?: GitHubConfig;
  localTokens?: TokenFile;
}

export function createProject(input: CreateProjectInput): Project {
  const now = Date.now();
  const project: Project = {
    id: randomUUID(),
    name: input.name.trim() || 'Untitled',
    source: input.source,
    github: input.source === 'github' ? input.github : undefined,
    localTokens: input.source === 'local' ? input.localTokens || {} : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const projects = store.get('projects');
  store.set('projects', [...projects, project]);
  return project;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  github?: GitHubConfig;
  localTokens?: TokenFile;
}

export function updateProject(input: UpdateProjectInput): Project {
  const projects = store.get('projects');
  const idx = projects.findIndex((p) => p.id === input.id);
  if (idx < 0) throw new Error(`Project ${input.id} not found`);
  const current = projects[idx];
  const updated: Project = {
    ...current,
    name: input.name !== undefined ? input.name : current.name,
    github: input.github !== undefined ? input.github : current.github,
    localTokens: input.localTokens !== undefined ? input.localTokens : current.localTokens,
    updatedAt: Date.now(),
  };
  const next = [...projects];
  next[idx] = updated;
  store.set('projects', next);
  return updated;
}

/**
 * Force-change a project's source (used by the migration handler).
 * Not exposed in updateProject because it's a destructive operation we want isolated.
 */
export function overrideProjectSource(id: string, source: ProjectSource): void {
  const projects = store.get('projects');
  const idx = projects.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error(`Project ${id} not found`);
  const next = [...projects];
  next[idx] = { ...next[idx], source, updatedAt: Date.now() };
  store.set('projects', next);
}

export function deleteProject(id: string): void {
  const projects = store.get('projects').filter((p) => p.id !== id);
  store.set('projects', projects);
  if (store.get('currentProjectId') === id) {
    store.set('currentProjectId', null);
  }
}

// ---- Helpers ----

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
