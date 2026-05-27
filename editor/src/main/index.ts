import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import { promises as fs } from 'fs';
import { Octokit } from '@octokit/rest';
import {
  IPC,
  GitHubConfig,
  TokenFile,
  CommitInfo,
  Project,
  ProjectSource,
} from '../shared/types';
import {
  migrateLegacyConfig,
  listProjects,
  getProject,
  getCurrentProjectId,
  setCurrentProjectId,
  createProject,
  updateProject,
  deleteProject,
  overrideProjectSource,
} from './projectStore';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  migrateLegacyConfig();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- Helpers ----

function requireProject(id?: string): Project {
  const projectId = id || getCurrentProjectId();
  if (!projectId) throw new Error('No project selected');
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  return project;
}

function requireGitHubProject(id?: string): { project: Project; config: GitHubConfig } {
  const project = requireProject(id);
  if (project.source !== 'github' || !project.github) {
    throw new Error('This operation requires a GitHub project');
  }
  return { project, config: project.github };
}

function getOctokitFor(config: GitHubConfig): Octokit {
  if (!config.pat) throw new Error('GitHub PAT missing');
  return new Octokit({ auth: config.pat });
}

async function fetchFile(octokit: Octokit, config: GitHubConfig, ref: string) {
  const res = await octokit.repos.getContent({
    owner: config.owner,
    repo: config.repo,
    path: config.filePath,
    ref,
  });
  if (Array.isArray(res.data) || res.data.type !== 'file') {
    throw new Error('Path is not a file');
  }
  const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
  return { content, sha: res.data.sha };
}

// ---- Project CRUD ----

ipcMain.handle(IPC.LIST_PROJECTS, () => listProjects());

ipcMain.handle(IPC.GET_CURRENT_PROJECT, () => {
  const id = getCurrentProjectId();
  return id ? getProject(id) : null;
});

ipcMain.handle(IPC.SET_CURRENT_PROJECT, (_e, id: string | null) => {
  setCurrentProjectId(id);
  return { ok: true };
});

ipcMain.handle(
  IPC.CREATE_PROJECT,
  (_e, input: { name: string; source: ProjectSource; github?: GitHubConfig; localTokens?: TokenFile }) => {
    const project = createProject(input);
    setCurrentProjectId(project.id);
    return project;
  }
);

ipcMain.handle(
  IPC.UPDATE_PROJECT,
  (_e, input: { id: string; name?: string; github?: GitHubConfig; localTokens?: TokenFile }) => {
    return updateProject(input);
  }
);

ipcMain.handle(IPC.DELETE_PROJECT, (_e, id: string) => {
  deleteProject(id);
  return { ok: true };
});

// ---- Tokens (project-scoped) ----

ipcMain.handle(IPC.LOAD_TOKENS, async (_e, projectId?: string): Promise<TokenFile> => {
  const project = requireProject(projectId);
  if (project.source === 'github') {
    const config = project.github!;
    const octokit = getOctokitFor(config);
    const { content } = await fetchFile(octokit, config, config.branch);
    return JSON.parse(content) as TokenFile;
  }
  // Local: return the stored tokens
  return project.localTokens || {};
});

ipcMain.handle(
  IPC.SAVE_LOCAL,
  (_e, payload: { projectId?: string; tokens: TokenFile }) => {
    const project = requireProject(payload.projectId);
    if (project.source !== 'local') {
      throw new Error('save-local is only valid for local projects');
    }
    updateProject({ id: project.id, localTokens: payload.tokens });
    return { ok: true };
  }
);

ipcMain.handle(
  IPC.CREATE_PR,
  async (
    _e,
    payload: { projectId?: string; tokens: TokenFile; message: string; description?: string }
  ) => {
    const { config } = requireGitHubProject(payload.projectId);
    const octokit = getOctokitFor(config);

    const baseRef = await octokit.git.getRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
    });
    const baseSha = baseRef.data.object.sha;
    const { sha: fileSha } = await fetchFile(octokit, config, config.branch);

    const branchName = `edit/${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
    await octokit.git.createRef({
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    const newContent = JSON.stringify(payload.tokens, null, 2) + '\n';
    await octokit.repos.createOrUpdateFileContents({
      owner: config.owner,
      repo: config.repo,
      path: config.filePath,
      message: payload.message,
      content: Buffer.from(newContent, 'utf-8').toString('base64'),
      sha: fileSha,
      branch: branchName,
    });

    const pr = await octokit.pulls.create({
      owner: config.owner,
      repo: config.repo,
      title: payload.message,
      body: payload.description || 'Edited via Somfy Tokens Editor',
      head: branchName,
      base: config.branch,
    });

    return { url: pr.data.html_url, number: pr.data.number, branch: branchName };
  }
);

ipcMain.handle(
  IPC.EXPORT_JSON,
  async (_e, payload: { projectId?: string; tokens: TokenFile; suggestedName?: string }) => {
    const project = requireProject(payload.projectId);
    const win = mainWindow;
    if (!win) throw new Error('No window');
    const fileName = (payload.suggestedName || `${project.name}.tokens.json`).replace(/[/\\]/g, '_');
    const res = await dialog.showSaveDialog(win, {
      title: 'Exporter les tokens',
      defaultPath: fileName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    // Inject sensible defaults so an exported file is standards-friendly even
    // when the source tree (e.g. brand new local project) didn't carry any
    // metadata. Existing values are preserved.
    const out: any = { ...payload.tokens };
    if (!out.$schema) out.$schema = 'https://design-tokens.github.io/community-group/format/';
    if (!out.$description || !String(out.$description).trim()) {
      out.$description = 'Design Tokens (W3C format)';
    }
    await fs.writeFile(res.filePath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    return { canceled: false, filePath: res.filePath };
  }
);

ipcMain.handle(IPC.IMPORT_JSON, async () => {
  const win = mainWindow;
  if (!win) throw new Error('No window');
  const res = await dialog.showOpenDialog(win, {
    title: 'Importer un fichier de tokens',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return { canceled: true };
  const text = await fs.readFile(res.filePaths[0], 'utf-8');
  let parsed: TokenFile;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
  return { canceled: false, filePath: res.filePaths[0], tokens: parsed };
});

ipcMain.handle(IPC.GET_HISTORY, async (_e, payload: { projectId?: string; limit?: number }): Promise<CommitInfo[]> => {
  const { config } = requireGitHubProject(payload?.projectId);
  const octokit = getOctokitFor(config);
  const res = await octokit.repos.listCommits({
    owner: config.owner,
    repo: config.repo,
    path: config.filePath,
    per_page: payload?.limit ?? 30,
  });
  return res.data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name || 'unknown',
    date: c.commit.author?.date || '',
    url: c.html_url,
  }));
});

ipcMain.handle(
  IPC.GET_FILE_AT_COMMIT,
  async (_e, payload: { projectId?: string; sha: string }) => {
    const { config } = requireGitHubProject(payload.projectId);
    const octokit = getOctokitFor(config);
    const { content } = await fetchFile(octokit, config, payload.sha);
    return JSON.parse(content) as TokenFile;
  }
);

ipcMain.handle(
  IPC.REVERT_TO_COMMIT,
  async (_e, payload: { projectId?: string; sha: string; message: string }) => {
    const { config } = requireGitHubProject(payload.projectId);
    const octokit = getOctokitFor(config);

    const { content: oldContent } = await fetchFile(octokit, config, payload.sha);
    const tokens = JSON.parse(oldContent) as TokenFile;

    const baseRef = await octokit.git.getRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
    });
    const baseSha = baseRef.data.object.sha;
    const { sha: fileSha } = await fetchFile(octokit, config, config.branch);

    const branchName = `revert/${payload.sha.slice(0, 7)}-${Date.now()}`;
    await octokit.git.createRef({
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    const newContent = JSON.stringify(tokens, null, 2) + '\n';
    await octokit.repos.createOrUpdateFileContents({
      owner: config.owner,
      repo: config.repo,
      path: config.filePath,
      message: payload.message,
      content: Buffer.from(newContent, 'utf-8').toString('base64'),
      sha: fileSha,
      branch: branchName,
    });

    const pr = await octokit.pulls.create({
      owner: config.owner,
      repo: config.repo,
      title: payload.message,
      body: `Revert to commit ${payload.sha.slice(0, 7)}`,
      head: branchName,
      base: config.branch,
    });

    return { url: pr.data.html_url, number: pr.data.number, branch: branchName };
  }
);

// ---- GitHub connection test ----

ipcMain.handle(
  IPC.TEST_GITHUB,
  async (_e, config: GitHubConfig): Promise<{ ok: boolean; fileExists: boolean; error?: string }> => {
    try {
      const octokit = getOctokitFor(config);
      // 1. Repo exists + accessible
      await octokit.repos.get({ owner: config.owner, repo: config.repo });
      // 2. Branch exists
      await octokit.git.getRef({
        owner: config.owner,
        repo: config.repo,
        ref: `heads/${config.branch}`,
      });
      // 3. Does the target file already exist on that branch?
      let fileExists = false;
      try {
        await fetchFile(octokit, config, config.branch);
        fileExists = true;
      } catch {
        // 404 → file doesn't exist yet (fine for migration)
      }
      return { ok: true, fileExists };
    } catch (e: any) {
      return { ok: false, fileExists: false, error: e.message || String(e) };
    }
  }
);

// ---- Migration : local project → GitHub ----

ipcMain.handle(
  IPC.MIGRATE_TO_GITHUB,
  async (
    _e,
    payload: { projectId: string; github: GitHubConfig; tokens: TokenFile; message?: string }
  ): Promise<{ url: string; number: number; branch: string; project: Project }> => {
    const project = requireProject(payload.projectId);
    if (project.source !== 'local') {
      throw new Error('Only local projects can be migrated.');
    }
    const config = payload.github;
    const octokit = getOctokitFor(config);

    // Verify branch
    const baseRef = await octokit.git.getRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
    });
    const baseSha = baseRef.data.object.sha;

    // Refuse if the target file already exists (don't overwrite)
    try {
      await fetchFile(octokit, config, config.branch);
      throw new Error(
        `Le fichier ${config.filePath} existe déjà sur ${config.branch}. Choisis un autre chemin ou supprime-le d'abord.`
      );
    } catch (e: any) {
      // 404 is expected. Re-throw any other error (including our "already exists").
      if (!e || (e.status !== 404 && !String(e.message || '').toLowerCase().includes('not found'))) {
        if (String(e.message || '').includes('existe déjà')) throw e;
        // Otherwise treat as missing file (octokit raises with status 404 in many cases)
      }
    }

    // Create migration branch
    const branchName = `migrate/${Date.now()}`;
    await octokit.git.createRef({
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    // Push the initial file (no sha → creates new)
    const content = JSON.stringify(payload.tokens, null, 2) + '\n';
    await octokit.repos.createOrUpdateFileContents({
      owner: config.owner,
      repo: config.repo,
      path: config.filePath,
      message: payload.message || `Initialise ${config.filePath} depuis l'éditeur local`,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: branchName,
    });

    // Open PR
    const pr = await octokit.pulls.create({
      owner: config.owner,
      repo: config.repo,
      title: payload.message || `Migration locale → ${config.owner}/${config.repo}`,
      body: `Initialise ${config.filePath} avec ${JSON.stringify(payload.tokens, null, 2).split('\n').length} lignes de tokens depuis l'éditeur local.`,
      head: branchName,
      base: config.branch,
    });

    // Switch project to GitHub source
    const updated = updateProject({
      id: project.id,
      github: config,
      localTokens: undefined,
    });
    // Force source = 'github' (updateProject doesn't allow direct source change, so do it inline)
    // Workaround: re-read and patch via the internal store. We extend updateProject signature instead.
    // For now, since updateProject only sets fields, we patch source by writing project directly.
    const finalProject: Project = { ...updated, source: 'github' };
    // Persist the source change
    overrideProjectSource(project.id, 'github');

    return {
      url: pr.data.html_url,
      number: pr.data.number,
      branch: branchName,
      project: finalProject,
    };
  }
);

ipcMain.handle(IPC.OPEN_EXTERNAL, (_e, url: string) => shell.openExternal(url));

// ---- Legacy (kept for backwards compat — no-ops once projects are in use) ----

ipcMain.handle(IPC.GET_CONFIG, () => {
  const id = getCurrentProjectId();
  if (!id) return null;
  const project = getProject(id);
  return project && project.source === 'github' ? project.github : null;
});

ipcMain.handle(IPC.SAVE_CONFIG, () => {
  // No-op : projects are now managed via dedicated handlers.
  return { ok: true };
});
