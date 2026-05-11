/**
 * Mock implementation of the Electron preload API.
 * Activated when running the renderer in a pure browser context (e.g. `npm run dev:vite`),
 * for visual testing / Figma capture. Persists config in localStorage and serves
 * tokens from /somfy-tokens.json (Vite serves it from publicDir).
 */
import { GitHubConfig, TokenFile } from '../../shared/types';

const CONFIG_KEY = 'mock_github_config';

export function installMockApi() {
  if ((window as any).api) return; // real Electron API present
  (window as any).api = {
    getConfig: async (): Promise<GitHubConfig | null> => {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    saveConfig: async (c: GitHubConfig) => {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
      return { ok: true };
    },
    loadTokens: async (): Promise<TokenFile> => {
      const res = await fetch('/somfy-tokens.json');
      if (!res.ok) throw new Error('Tokens not available in browser mode (sample missing).');
      return res.json();
    },
    createPR: async () => ({
      url: 'https://github.com/example/repo/pull/0',
      number: 0,
      branch: 'mock-branch',
    }),
    getHistory: async () => [],
    getFileAtCommit: async () => ({} as TokenFile),
    revertToCommit: async () => ({ url: 'https://github.com/example/repo/pull/0' }),
    openExternal: async (url: string) => {
      window.open(url, '_blank');
    },
  };
  console.info('[mock-api] Browser mode: window.api stubbed (config in localStorage, tokens from /somfy-tokens.json).');
}
