import React, { useEffect, useMemo, useState } from 'react';
import { TokenFile, FlatToken, GitHubConfig } from '../shared/types';
import {
  flattenTokens,
  cloneTree,
  getTokenAt,
  setTokenAt,
  deleteTokenAt,
  renameReferences,
  findReferences,
  getAllTokenNames,
} from './utils/tokenTree';
import { computeDiff, totalChanges } from './utils/diff';
import { TokenRow } from './components/TokenRow';
import { SaveModal } from './components/SaveModal';
import { HistoryView } from './components/HistoryView';
import { ConfigScreen } from './components/ConfigScreen';

declare global {
  interface Window {
    api: {
      getConfig: () => Promise<GitHubConfig | null>;
      saveConfig: (c: GitHubConfig) => Promise<{ ok: boolean }>;
      loadTokens: () => Promise<TokenFile>;
      createPR: (p: any) => Promise<{ url: string; number: number; branch: string }>;
      getHistory: (limit?: number) => Promise<any[]>;
      getFileAtCommit: (sha: string) => Promise<TokenFile>;
      revertToCommit: (p: any) => Promise<{ url: string }>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

type Screen = 'config' | 'editor';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('config');
  const [config, setConfig] = useState<GitHubConfig | null>(null);

  const [originalTree, setOriginalTree] = useState<TokenFile | null>(null);
  const [tree, setTree] = useState<TokenFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<{ msg: string; url?: string } | null>(null);

  // Bootstrap
  useEffect(() => {
    (async () => {
      const c = await window.api.getConfig();
      if (c) {
        setConfig(c);
        setScreen('editor');
        await reload(c);
      }
    })();
  }, []);

  const reload = async (_c?: GitHubConfig) => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.api.loadTokens();
      setOriginalTree(data);
      setTree(cloneTree(data));
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (newConfig: GitHubConfig) => {
    await window.api.saveConfig(newConfig);
    setConfig(newConfig);
    setScreen('editor');
    await reload(newConfig);
  };

  // ----- Edit handlers -----

  const handleValueChange = (path: string[], value: any) => {
    if (!tree) return;
    const next = cloneTree(tree);
    const token = getTokenAt(next, path);
    if (token) {
      token.$value = value;
      setTree(next);
    }
  };

  const handleValueChangeMode = (path: string[], mode: 'light' | 'dark', value: any) => {
    if (!tree) return;
    const next = cloneTree(tree);
    const token = getTokenAt(next, path);
    if (token) {
      if (!token.$extensions) token.$extensions = {};
      if (!token.$extensions.modes) token.$extensions.modes = {};
      token.$extensions.modes[mode] = value;
      setTree(next);
    }
  };

  const handleRename = (oldPath: string[], newSegment: string) => {
    if (!tree) return;
    const next = cloneTree(tree);

    const token = getTokenAt(next, oldPath);
    if (!token) return;

    const oldFullName = oldPath.join('.');
    const newPath = [...oldPath.slice(0, -1), newSegment];
    const newFullName = newPath.join('.');

    if (oldFullName === newFullName) return;

    // Check for collision
    if (getTokenAt(next, newPath)) {
      alert(`Le token "${newFullName}" existe déjà.`);
      return;
    }

    // Find references before renaming so we can show count
    const refs = findReferences(next, oldFullName);

    if (refs.length > 0) {
      const ok = confirm(
        `${refs.length} token(s) référence(nt) ${oldFullName}.\n` +
          `Mettre à jour automatiquement ces références vers ${newFullName} ?`
      );
      if (!ok) return;
    }

    // Move token
    deleteTokenAt(next, oldPath);
    setTokenAt(next, newPath, token);

    // Update references
    if (refs.length > 0) renameReferences(next, oldFullName, newFullName);

    setTree(next);
  };

  // ----- Save / PR -----

  const diff = useMemo(() => {
    if (!originalTree || !tree) return null;
    return computeDiff(originalTree, tree);
  }, [originalTree, tree]);

  const hasChanges = diff && totalChanges(diff) > 0;

  const handleConfirmSave = async (message: string, description: string) => {
    if (!tree) return;
    const result = await window.api.createPR({ tokens: tree, message, description });
    setShowSaveModal(false);
    setToast({ msg: `PR #${result.number} créée`, url: result.url });
    // Reload to get the new "original" baseline
    // Note: PR isn't merged yet, so reload from main is unchanged.
    // We optimistically update originalTree to current tree to clear the diff.
    setOriginalTree(cloneTree(tree));
  };

  const handleRevert = async (sha: string, shortSha: string) => {
    const result = await window.api.revertToCommit({
      sha,
      message: `Revert tokens to ${shortSha}`,
    });
    setShowHistory(false);
    setToast({ msg: `PR de revert créée`, url: result.url });
  };

  // ----- Render -----

  if (screen === 'config') {
    return <ConfigScreen initial={config} onSave={handleSaveConfig} />;
  }

  if (loading) return <div className="loading-screen">Chargement des tokens…</div>;

  if (error) {
    return (
      <div className="error-screen">
        <h2>Erreur</h2>
        <p>{error}</p>
        <button onClick={() => setScreen('config')}>Modifier la config</button>
        <button onClick={() => reload()}>Réessayer</button>
      </div>
    );
  }

  if (!tree || !originalTree) return null;

  const flatTokens = flattenTokens(tree);
  const allTokenNames = getAllTokenNames(tree);
  const originalFlatMap = new Map(flattenTokens(originalTree).map((t) => [t.fullName, t]));

  // Filter
  const filtered = flatTokens.filter((t) => {
    if (activeCategory !== 'all' && !matchesCategory(t, activeCategory)) return false;
    if (search && !t.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by layer → category
  const grouped = groupTokens(filtered);

  // Reference counts (computed once on current tree)
  const refCounts = computeRefCounts(tree, flatTokens);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>Somfy Tokens</h1>
          <span className="muted">
            {config?.owner}/{config?.repo} • {config?.branch}
          </span>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowHistory(true)}>Historique</button>
          <button onClick={() => reload()}>Recharger</button>
          <button onClick={() => setScreen('config')}>⚙</button>
        </div>
      </header>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Rechercher un token…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search"
        />
        <div className="category-tabs">
          {CATEGORY_TABS.map((cat) => {
            const count =
              cat.id === 'all'
                ? flatTokens.length
                : flatTokens.filter((t) => matchesCategory(t, cat.id)).length;
            return (
              <button
                key={cat.id}
                className={activeCategory === cat.id ? 'active' : ''}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
                <span className="tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="token-list">
        {grouped.map((group) => (
          <section key={group.layer + group.category} className="token-group">
            <h2>
              <span className="group-layer">{group.layer}</span>
              <span className="group-sep">/</span>
              <span className="group-category">{group.category}</span>
              <span className="group-count">{group.tokens.length}</span>
            </h2>
            <div className="token-rows">
              {group.tokens.map((t) => {
                const original = originalFlatMap.get(t.fullName);
                const isModified =
                  !original ||
                  JSON.stringify(original.value) !== JSON.stringify(t.value) ||
                  JSON.stringify(original.modes ?? null) !== JSON.stringify(t.modes ?? null);
                return (
                  <TokenRow
                    key={t.fullName}
                    token={t}
                    allTokenNames={allTokenNames}
                    isModified={isModified && !!original}
                    isRenamed={!original}
                    referenceCount={refCounts.get(t.fullName) || 0}
                    onRename={handleRename}
                    onValueChange={handleValueChange}
                    onValueChangeMode={handleValueChangeMode}
                  />
                );
              })}
            </div>
          </section>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">Aucun token ne correspond à la recherche.</div>
        )}
      </main>

      {hasChanges && (
        <div className="save-bar">
          <span>
            {totalChanges(diff!)} modification(s) en attente
            {diff!.modified.length > 0 && ` · ${diff!.modified.length} modifié(s)`}
            {diff!.added.length > 0 && ` · ${diff!.added.length} ajouté(s)`}
            {diff!.removed.length > 0 && ` · ${diff!.removed.length} supprimé(s)`}
          </span>
          <div>
            <button onClick={() => setTree(cloneTree(originalTree))}>Annuler</button>
            <button className="primary" onClick={() => setShowSaveModal(true)}>
              Sauvegarder les modifications
            </button>
          </div>
        </div>
      )}

      {showSaveModal && diff && (
        <SaveModal
          diff={diff}
          onConfirm={handleConfirmSave}
          onCancel={() => setShowSaveModal(false)}
        />
      )}

      {showHistory && (
        <HistoryView onRevert={handleRevert} onClose={() => setShowHistory(false)} />
      )}

      {toast && (
        <div className="toast">
          {toast.msg}
          {toast.url && (
            <button onClick={() => window.api.openExternal(toast.url!)}>Ouvrir la PR</button>
          )}
          <button onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
};

// Helpers

const CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'color', label: 'Color' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'radius', label: 'Radius' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'font', label: 'Font' },
];

/**
 * Match a token to a category tab.
 * Strategy: prefer $type when present; fallback to keywords in the path.
 */
function matchesCategory(t: FlatToken, categoryId: string): boolean {
  if (categoryId === 'all') return true;

  const type = t.type;
  const pathStr = t.fullName.toLowerCase();

  switch (categoryId) {
    case 'color':
      return type === 'color' || /(^|\.)(color|colour)(\.|$)/.test(pathStr);
    case 'spacing':
      // dimensions used for spacing/padding/margin/gap/size
      return (
        (type === 'dimension' &&
          /(spacing|padding|margin|gap|size|space)/.test(pathStr)) ||
        /(^|\.)(spacing|padding|margin|gap)(\.|$)/.test(pathStr)
      );
    case 'radius':
      return /(^|\.)(radius|rounded|corner)(\.|$)/.test(pathStr);
    case 'shadow':
      return type === 'shadow' || /(^|\.)(shadow|elevation)(\.|$)/.test(pathStr);
    case 'font':
      return (
        type === 'fontFamily' ||
        type === 'fontSize' ||
        type === 'fontWeight' ||
        type === 'lineHeight' ||
        type === 'letterSpacing' ||
        type === 'typography' ||
        /(^|\.)(font|typography|text)(\.|$)/.test(pathStr)
      );
    default:
      return false;
  }
}

function groupTokens(tokens: FlatToken[]) {
  const map = new Map<string, { layer: string; category: string; tokens: FlatToken[] }>();
  for (const t of tokens) {
    const key = `${t.layer}/${t.category}`;
    if (!map.has(key)) map.set(key, { layer: t.layer, category: t.category, tokens: [] });
    map.get(key)!.tokens.push(t);
  }
  // Stable layer order
  const layerOrder = ['primitives', 'semantic', 'composite', 'component'];
  return Array.from(map.values()).sort((a, b) => {
    const la = layerOrder.indexOf(a.layer);
    const lb = layerOrder.indexOf(b.layer);
    if (la !== lb) return la - lb;
    return a.category.localeCompare(b.category);
  });
}

function computeRefCounts(tree: TokenFile, flatTokens: FlatToken[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of flatTokens) {
    const refs = findReferences(tree, t.fullName);
    if (refs.length > 0) counts.set(t.fullName, refs.length);
  }
  return counts;
}
