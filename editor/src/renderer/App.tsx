import React, { useEffect, useMemo, useState } from 'react';
import { TokenFile, FlatToken, GitHubConfig, Token } from '../shared/types';
import {
  flattenTokens,
  cloneTree,
  getTokenAt,
  setTokenAt,
  deleteTokenAt,
  renameReferences,
  findReferences,
  getAllTokenNames,
  addToken,
  addGroup,
  deleteNodeAt,
  findReferencesUnder,
  getNodeAt,
  isGroup,
  ALL_LAYERS,
} from './utils/tokenTree';
import { computeDiff, totalChanges } from './utils/diff';
import { SaveModal } from './components/SaveModal';
import { HistoryView } from './components/HistoryView';
import { ConfigScreen } from './components/ConfigScreen';
import { AddTokenModal } from './components/AddTokenModal';
import { AddGroupModal } from './components/AddGroupModal';
import { StatsStrip } from './components/StatsStrip';
import { SidebarTree } from './components/SidebarTree';
import { TokenTable } from './components/TokenTable';
import { TokenInspector } from './components/TokenInspector';
import { FilterPills, matchesFilter } from './components/FilterPills';

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
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sidebarPath, setSidebarPath] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(ALL_LAYERS)
  );
  const [selectedTokenPath, setSelectedTokenPath] = useState<string[] | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<{ msg: string; url?: string } | null>(null);

  const [addTokenModal, setAddTokenModal] = useState<{ initialPath: string[] } | null>(null);
  const [addGroupModal, setAddGroupModal] = useState<{ initialPath: string[] } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

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

  const handleDescriptionChange = (path: string[], description: string) => {
    if (!tree) return;
    const next = cloneTree(tree);
    const token = getTokenAt(next, path);
    if (token) {
      if (description.trim()) token.$description = description.trim();
      else delete token.$description;
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
    if (getTokenAt(next, newPath)) {
      alert(`Le token "${newFullName}" existe déjà.`);
      return;
    }
    const refs = findReferences(next, oldFullName);
    if (refs.length > 0) {
      const ok = confirm(
        `${refs.length} token(s) référence(nt) ${oldFullName}.\n` +
          `Mettre à jour automatiquement ces références vers ${newFullName} ?`
      );
      if (!ok) return;
    }
    deleteTokenAt(next, oldPath);
    setTokenAt(next, newPath, token);
    if (refs.length > 0) renameReferences(next, oldFullName, newFullName);
    setTree(next);
    if (selectedTokenPath && selectedTokenPath.join('.') === oldFullName) {
      setSelectedTokenPath(newPath);
    }
  };

  const handleAddToken = (parentPath: string[], name: string, token: Token) => {
    if (!tree) return;
    const next = cloneTree(tree);
    let cursor: any = next;
    for (const seg of parentPath) {
      if (!cursor[seg] || typeof cursor[seg] !== 'object') cursor[seg] = {};
      cursor = cursor[seg];
    }
    try {
      addToken(next, parentPath, name, token);
      setTree(next);
      setAddTokenModal(null);
      setSelectedTokenPath([...parentPath, name]);
    } catch (e: any) {
      alert(e.message || 'Erreur');
    }
  };

  const handleAddGroup = (parentPath: string[], name: string) => {
    if (!tree) return;
    const next = cloneTree(tree);
    let cursor: any = next;
    for (const seg of parentPath) {
      if (!cursor[seg] || typeof cursor[seg] !== 'object') cursor[seg] = {};
      cursor = cursor[seg];
    }
    try {
      addGroup(next, parentPath, name);
      setTree(next);
      setAddGroupModal(null);
    } catch (e: any) {
      alert(e.message || 'Erreur');
    }
  };

  const handleDeleteToken = (path: string[]) => {
    if (!tree) return;
    const fullName = path.join('.');
    const refs = findReferences(tree, fullName);
    if (refs.length > 0) {
      alert(
        `Suppression bloquée : ${refs.length} token(s) référence(nt) "${fullName}".\n\n` +
          refs.slice(0, 10).map((p) => '• ' + p.join('.')).join('\n') +
          (refs.length > 10 ? `\n…et ${refs.length - 10} autre(s)` : '')
      );
      return;
    }
    if (!confirm(`Supprimer le token "${fullName}" ?`)) return;
    const next = cloneTree(tree);
    deleteTokenAt(next, path);
    setTree(next);
    if (selectedTokenPath && selectedTokenPath.join('.') === fullName) {
      setSelectedTokenPath(null);
    }
  };

  const handleDeleteGroup = (path: string[]) => {
    if (!tree) return;
    const node = getNodeAt(tree, path);
    if (!node || !isGroup(node)) return;
    const fullName = path.join('.');
    const refs = findReferencesUnder(tree, path);
    if (refs.length > 0) {
      const lines = refs.slice(0, 10).map((r) => `• ${r.referenced} ← ${r.referencedBy.join(', ')}`);
      alert(
        `Suppression du groupe "${fullName}" bloquée : ${refs.length} token(s) sont référencés en dehors du groupe.\n\n` +
          lines.join('\n') +
          (refs.length > 10 ? `\n…et ${refs.length - 10} autre(s)` : '')
      );
      return;
    }
    const flatUnder = flattenTokens(tree).filter(
      (t) => t.fullName === fullName || t.fullName.startsWith(fullName + '.')
    );
    if (
      !confirm(
        `Supprimer le groupe "${fullName}" et ses ${flatUnder.length} token(s) ?\nCette action est définitive.`
      )
    )
      return;
    const next = cloneTree(tree);
    deleteNodeAt(next, path);
    setTree(next);
    if (sidebarPath.join('.').startsWith(fullName)) setSidebarPath([]);
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
    setOriginalTree(cloneTree(tree));
  };

  const handleRevert = async (sha: string, shortSha: string) => {
    const result = await window.api.revertToCommit({ sha, message: `Revert tokens to ${shortSha}` });
    setShowHistory(false);
    setToast({ msg: `PR de revert créée`, url: result.url });
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
  const sidebarPrefix = sidebarPath.join('.');
  const filtered = flatTokens.filter((t) => {
    if (sidebarPrefix && !t.fullName.startsWith(sidebarPrefix + '.') && t.fullName !== sidebarPrefix) {
      return false;
    }
    if (!matchesFilter(t, typeFilter)) return false;
    if (search && !t.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group filtered tokens by leaf-group (parent path) for visual sectioning
  const grouped = groupByParent(filtered);

  // Selected token (if path still valid)
  const selectedToken = selectedTokenPath
    ? flatTokens.find((t) => t.fullName === selectedTokenPath.join('.')) || null
    : null;

  const refCounts = computeRefCounts(tree, flatTokens);

  return (
    <div className={`app-v2 ${selectedToken ? 'has-inspector' : ''}`}>
      <header className="app-header-v2">
        <div className="header-title">
          <h1>Somfy Tokens</h1>
          {config && (
            <span className="header-meta">
              {config.owner}/{config.repo} <span className="muted">·</span> {config.branch}
            </span>
          )}
        </div>
        <div className="header-actions-v2">
          <input
            type="search"
            className="header-search"
            placeholder="Rechercher un token…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="add-menu-wrap">
            <button
              className="primary"
              onClick={() => setAddMenuOpen((o) => !o)}
              onBlur={() => setTimeout(() => setAddMenuOpen(false), 150)}
            >
              + Add ▾
            </button>
            {addMenuOpen && (
              <div className="add-menu">
                <button
                  onMouseDown={() => {
                    setAddTokenModal({ initialPath: sidebarPath });
                    setAddMenuOpen(false);
                  }}
                >
                  Token
                </button>
                <button
                  onMouseDown={() => {
                    setAddGroupModal({ initialPath: sidebarPath });
                    setAddMenuOpen(false);
                  }}
                >
                  Group
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setShowHistory(true)} title="Historique">⏱</button>
          <button onClick={() => reload()} title="Recharger">⟳</button>
          <button onClick={() => setScreen('config')} title="Configuration">⚙</button>
        </div>
      </header>

      <StatsStrip tokens={flatTokens} diff={diff} />

      <SidebarTree
        tree={tree}
        selectedPath={sidebarPath}
        onSelect={(p) => setSidebarPath(p)}
        expanded={expandedGroups}
        onToggle={toggleGroup}
      />

      <main className="main-panel">
        <div className="main-toolbar">
          <FilterPills tokens={flatTokens} active={typeFilter} onChange={setTypeFilter} />
          {sidebarPath.length > 0 && (
            <div className="sidebar-context">
              <span className="muted">Contexte :</span>{' '}
              <span className="mono">{sidebarPath.join('.')}</span>
              <div className="context-actions">
                <button onClick={() => setAddTokenModal({ initialPath: sidebarPath })}>+ Token</button>
                <button onClick={() => setAddGroupModal({ initialPath: sidebarPath })}>+ Group</button>
                <button
                  onClick={() => handleDeleteGroup(sidebarPath)}
                  className="danger"
                  title="Supprimer ce groupe"
                >
                  🗑
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="token-list-v2">
          {grouped.map((group) => {
            const meta = new Map<string, { isModified: boolean; isAdded: boolean; refCount: number }>();
            for (const t of group.tokens) {
              const original = originalFlatMap.get(t.fullName);
              const isModified =
                !!original &&
                (JSON.stringify(original.value) !== JSON.stringify(t.value) ||
                  JSON.stringify(original.modes ?? null) !== JSON.stringify(t.modes ?? null));
              meta.set(t.fullName, {
                isModified,
                isAdded: !original,
                refCount: refCounts.get(t.fullName) || 0,
              });
            }
            return (
              <section key={group.parent} className="token-section">
                {group.parent && (
                  <h3 className="token-section-title">
                    <span className="mono">{group.parent}</span>
                    <span className="token-section-count">{group.tokens.length}</span>
                  </h3>
                )}
                <TokenTable
                  tokens={group.tokens}
                  tree={tree}
                  meta={meta}
                  selectedPath={selectedTokenPath ? selectedTokenPath.join('.') : null}
                  onSelect={(p) => setSelectedTokenPath(p)}
                  onValueChange={handleValueChange}
                  onDescriptionChange={handleDescriptionChange}
                  onRename={handleRename}
                  onDelete={handleDeleteToken}
                />
              </section>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-state">Aucun token ne correspond aux filtres.</div>
          )}
        </div>
      </main>

      {selectedToken && (
        <TokenInspector
          token={selectedToken}
          tree={tree}
          allTokenNames={allTokenNames}
          onClose={() => setSelectedTokenPath(null)}
          onRename={handleRename}
          onValueChange={handleValueChange}
          onValueChangeMode={handleValueChangeMode}
          onDelete={handleDeleteToken}
          onSelectToken={(p) => setSelectedTokenPath(p)}
        />
      )}

      {hasChanges && (
        <div className="save-bar-v2">
          <div className="save-bar-summary">
            <span className="save-bar-count">{totalChanges(diff!)} modification(s)</span>
            {diff!.modified.length > 0 && (
              <span className="diff-pill diff-modified">~ {diff!.modified.length} modifié</span>
            )}
            {diff!.added.length > 0 && (
              <span className="diff-pill diff-added">+ {diff!.added.length} ajouté</span>
            )}
            {diff!.removed.length > 0 && (
              <span className="diff-pill diff-removed">− {diff!.removed.length} supprimé</span>
            )}
          </div>
          <div className="save-bar-actions">
            <button onClick={() => setTree(cloneTree(originalTree))}>Annuler</button>
            <button className="primary" onClick={() => setShowSaveModal(true)}>
              Sauvegarder
            </button>
          </div>
        </div>
      )}

      {showSaveModal && diff && (
        <SaveModal diff={diff} onConfirm={handleConfirmSave} onCancel={() => setShowSaveModal(false)} />
      )}
      {showHistory && (
        <HistoryView onRevert={handleRevert} onClose={() => setShowHistory(false)} />
      )}
      {addTokenModal && (
        <AddTokenModal
          tree={tree}
          initialPath={addTokenModal.initialPath}
          onConfirm={handleAddToken}
          onCancel={() => setAddTokenModal(null)}
        />
      )}
      {addGroupModal && (
        <AddGroupModal
          tree={tree}
          initialPath={addGroupModal.initialPath}
          onConfirm={handleAddGroup}
          onCancel={() => setAddGroupModal(null)}
        />
      )}
      {toast && (
        <div className="toast">
          {toast.msg}
          {toast.url && (
            <button
              onClick={() => {
                window.api.openExternal(toast.url!);
                setToast(null);
              }}
            >
              Ouvrir la PR
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Helpers

function groupByParent(tokens: FlatToken[]): { parent: string; tokens: FlatToken[] }[] {
  const map = new Map<string, FlatToken[]>();
  for (const t of tokens) {
    const parent = t.path.slice(0, -1).join('.');
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent)!.push(t);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([parent, tokens]) => ({ parent, tokens }));
}

function computeRefCounts(tree: TokenFile, flatTokens: FlatToken[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of flatTokens) {
    const refs = findReferences(tree, t.fullName);
    if (refs.length > 0) counts.set(t.fullName, refs.length);
  }
  return counts;
}
