import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { Octokit } from '@octokit/rest';
import { IPC, GitHubConfig, TokenFile, CommitInfo } from '../shared/types';

const store = new Store<{ github: GitHubConfig | null }>({
  defaults: { github: null },
});

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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- GitHub helpers ----

function getOctokit(): Octokit {
  const config = store.get('github');
  if (!config?.pat) throw new Error('GitHub not configured');
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

// ---- IPC handlers ----

ipcMain.handle(IPC.GET_CONFIG, () => {
  const config = store.get('github');
  // Don't send PAT to renderer in plaintext on every load — but for local POC it's fine.
  // In a more hardened version, store PAT in OS keychain via 'keytar'.
  return config;
});

ipcMain.handle(IPC.SAVE_CONFIG, (_e, config: GitHubConfig) => {
  store.set('github', config);
  return { ok: true };
});

ipcMain.handle(IPC.LOAD_TOKENS, async () => {
  const config = store.get('github');
  if (!config) throw new Error('Not configured');
  const octokit = getOctokit();
  const { content } = await fetchFile(octokit, config, config.branch);
  return JSON.parse(content) as TokenFile;
});

ipcMain.handle(
  IPC.CREATE_PR,
  async (_e, payload: { tokens: TokenFile; message: string; description?: string }) => {
    const config = store.get('github');
    if (!config) throw new Error('Not configured');
    const octokit = getOctokit();

    // 1. Get current main SHA + file SHA
    const baseRef = await octokit.git.getRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
    });
    const baseSha = baseRef.data.object.sha;

    const { sha: fileSha } = await fetchFile(octokit, config, config.branch);

    // 2. Create new branch
    const branchName = `edit/${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 16)}`;

    await octokit.git.createRef({
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    // 3. Commit new content on that branch
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

    // 4. Open PR
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

ipcMain.handle(IPC.GET_HISTORY, async (_e, limit: number = 30): Promise<CommitInfo[]> => {
  const config = store.get('github');
  if (!config) throw new Error('Not configured');
  const octokit = getOctokit();

  const res = await octokit.repos.listCommits({
    owner: config.owner,
    repo: config.repo,
    path: config.filePath,
    per_page: limit,
  });

  return res.data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name || 'unknown',
    date: c.commit.author?.date || '',
    url: c.html_url,
  }));
});

ipcMain.handle(IPC.GET_FILE_AT_COMMIT, async (_e, sha: string) => {
  const config = store.get('github');
  if (!config) throw new Error('Not configured');
  const octokit = getOctokit();
  const { content } = await fetchFile(octokit, config, sha);
  return JSON.parse(content) as TokenFile;
});

ipcMain.handle(IPC.REVERT_TO_COMMIT, async (_e, payload: { sha: string; message: string }) => {
  const config = store.get('github');
  if (!config) throw new Error('Not configured');
  const octokit = getOctokit();

  // Get the file content at the target commit
  const { content: oldContent } = await fetchFile(octokit, config, payload.sha);
  const tokens = JSON.parse(oldContent) as TokenFile;

  // Reuse PR creation logic
  const result = await ipcMain.emit(IPC.CREATE_PR, _e, {
    tokens,
    message: payload.message,
    description: `Revert to commit ${payload.sha.slice(0, 7)}`,
  });

  // Note: ipcMain.emit doesn't return the handler's value cleanly.
  // Better to call the logic directly:
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
});

ipcMain.handle(IPC.OPEN_EXTERNAL, (_e, url: string) => {
  return shell.openExternal(url);
});
