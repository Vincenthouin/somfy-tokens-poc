import React, { useEffect, useMemo, useState } from 'react';
import { TokenFile, FlatToken, Token, Project } from '../shared/types';
import {
  flattenTokens,
  cloneTree,
  getTokenAt,
  setTokenAt,
  deleteTokenAt,
  renameReferences,
  findReferences,
  findBrokenAliases,
  tokenHasEmptyValue,
  getAllTokenNames,
  addToken,
  addGroup,
  deleteNodeAt,
  findReferencesUnder,
  getNodeAt,
  isGroup,
  renameNode,
  moveNode,
  ALL_LAYERS,
} from './utils/tokenTree';
import { computeDiff, totalChanges } from './utils/diff';
import { SaveModal } from './components/SaveModal';
import { HistoryView } from './components/HistoryView';
import { AddTokenModal } from './components/AddTokenModal';
import { AddGroupModal } from './components/AddGroupModal';
import { StatsStrip } from './components/StatsStrip';
import { SidebarTree } from './components/SidebarTree';
import { TokenTable } from './components/TokenTable';
import { TokenInspector } from './components/TokenInspector';
import { FilterPills, matchesFilter } from './components/FilterPills';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { DeleteWithRefsModal } from './components/DeleteWithRefsModal';
import { useTreeHistory } from './utils/useTreeHistory';

interface Props {
  project: Project;
  onProjectChange: (project: Project) => void;
  onBackToProjects: () => void;
}

export const EditorScreen: React.FC<Props> = ({ project, onProjectChange, onBackToProjects }) => {
  const [originalTree, setOriginalTree] = useState<TokenFile | null>(null);
  const {
    tree,
    resetTree,
    setTree,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTreeHistory();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sidebarPath, setSidebarPath] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(ALL_LAYERS));
  const [selectedTokenPath, setSelectedTokenPath] = useState<string[] | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<{ msg: string; url?: string } | null>(null);

  const [addTokenModal, setAddTokenModal] = useState<{ initialPath: string[] } | null>(null);
  const [addGroupModal, setAddGroupModal] = useState<{ initialPath: string[] } | null>(null);
  const [deleteRefsModal, setDeleteRefsModal] = useState<{
    targetPath: string;
    refs: Array<{ referenced: string; referencedBy: string[] }>;
  } | null>(null);
  // Local-project auto-save: "idle" when caught up, "pending" when a save is
  // debounced, "saving" during the IPC call, "saved" briefly after success.
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());

  const toggleMultiSelect = (fullName: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  const toggleMultiSelectAll = (toks: FlatToken[]) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      const allInGroup = toks.every((t) => next.has(t.fullName));
      if (allInGroup) {
        for (const t of toks) next.delete(t.fullName);
      } else {
        for (const t of toks) next.add(t.fullName);
      }
      return next;
    });
  };

  const clearMultiSelect = () => setMultiSelected(new Set());

  const isLocal = project.source === 'local';

  // Load tokens whenever the project changes
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z (or Cmd+Y) = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const target = e.target as HTMLElement | null;
      // Let the OS-native undo/redo run inside text fields
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Auto-save for local projects: debounce every tree mutation (token edits,
  // group add/delete/rename/move, undo/redo) and persist silently. The diff
  // vs originalTree is the source of truth for "needs saving".
  useEffect(() => {
    if (!isLocal || !tree || !originalTree) return;
    // Quick path: if there's nothing pending, stay idle.
    if (JSON.stringify(tree) === JSON.stringify(originalTree)) {
      setAutoSaveStatus((prev) => (prev === 'saved' ? prev : 'idle'));
      return;
    }
    setAutoSaveStatus('pending');
    const handle = window.setTimeout(async () => {
      setAutoSaveStatus('saving');
      try {
        await window.api.saveLocal({ projectId: project.id, tokens: tree });
        setOriginalTree(cloneTree(tree));
        setAutoSaveStatus('saved');
        // Drop the "saved" badge after a moment so it stays unobtrusive.
        window.setTimeout(() => {
          setAutoSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 1500);
      } catch (e: any) {
        console.error('[auto-save] failed:', e);
        setAutoSaveStatus('idle');
        setToast({ msg: `Sauvegarde locale échouée : ${e.message || e}` });
      }
    }, 600);
    return () => window.clearTimeout(handle);
  }, [tree, originalTree, isLocal, project.id]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.api.loadTokens(project.id);
      setOriginalTree(data || {});
      resetTree(cloneTree(data || {}));
      setMultiSelected(new Set());
      setSelectedTokenPath(null);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
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
        `${refs.length} token(s) référence(nt) ${oldFullName}.\nMettre à jour automatiquement ces références vers ${newFullName} ?`
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

  const handleBulkDelete = () => {
    if (!tree || multiSelected.size === 0) return;
    const targets = Array.from(multiSelected);
    // Look up refs for each, excluding refs that come from other targets (they'll be deleted too)
    const targetsSet = new Set(targets);
    const blocked: { token: string; refs: string[] }[] = [];
    for (const fullName of targets) {
      const refs = findReferences(tree, fullName).map((p) => p.join('.'));
      const externalRefs = refs.filter((r) => !targetsSet.has(r));
      if (externalRefs.length > 0) blocked.push({ token: fullName, refs: externalRefs });
    }
    if (blocked.length > 0) {
      const lines = blocked.slice(0, 5).map((b) => `• ${b.token} ← ${b.refs.slice(0, 3).join(', ')}${b.refs.length > 3 ? '…' : ''}`);
      alert(
        `Suppression bloquée : ${blocked.length} token(s) sélectionné(s) sont référencé(s) en dehors de la sélection.\n\n` +
          lines.join('\n') +
          (blocked.length > 5 ? `\n…et ${blocked.length - 5} autre(s)` : '')
      );
      return;
    }
    if (!confirm(`Supprimer ${targets.length} token(s) sélectionné(s) ?\nCette action est définitive (annulable via ⌘Z).`)) return;
    const next = cloneTree(tree);
    for (const fullName of targets) {
      deleteTokenAt(next, fullName.split('.'));
    }
    setTree(next);
    if (selectedTokenPath && targetsSet.has(selectedTokenPath.join('.'))) {
      setSelectedTokenPath(null);
    }
    clearMultiSelect();
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

  // ----- Sidebar tree mutations (rename / move / dup / unified add+delete) -----

  // Unified delete: works for token OR group. Routes blocked-with-refs cases to
  // the modal, simple cases to a native confirm. Mirrors handleDeleteToken /
  // handleDeleteGroup behavior but with a richer UI for the dependency case.
  const handleSidebarDelete = (path: string[]) => {
    if (!tree || path.length === 0) return;
    const node = getNodeAt(tree, path);
    if (!node) return;
    const fullName = path.join('.');
    const isGroupNode = isGroup(node);
    const refs = isGroupNode
      ? findReferencesUnder(tree, path)
      : findReferences(tree, fullName).length > 0
        ? [{ referenced: fullName, referencedBy: findReferences(tree, fullName).map((p) => p.join('.')) }]
        : [];
    if (refs.length > 0) {
      setDeleteRefsModal({ targetPath: fullName, refs });
      return;
    }
    if (isGroupNode) {
      const flatUnder = flattenTokens(tree).filter(
        (t) => t.fullName === fullName || t.fullName.startsWith(fullName + '.')
      );
      if (!confirm(`Supprimer "${fullName}" et ses ${flatUnder.length} token(s) ?`)) return;
    } else {
      if (!confirm(`Supprimer le token "${fullName}" ?`)) return;
    }
    const next = cloneTree(tree);
    deleteNodeAt(next, path);
    setTree(next);
    if (selectedTokenPath && selectedTokenPath.join('.') === fullName) setSelectedTokenPath(null);
    if (sidebarPath.join('.').startsWith(fullName)) setSidebarPath([]);
  };

  const handleRenameNode = (path: string[], newName: string) => {
    if (!tree) return;
    const next = cloneTree(tree);
    try {
      const { aliasesUpdated, newPath } = renameNode(next, path, newName);
      setTree(next);
      // Move selection / sidebar focus to the new path if they pointed at the renamed node.
      const oldKey = path.join('.');
      if (sidebarPath.join('.') === oldKey) setSidebarPath(newPath);
      if (selectedTokenPath && selectedTokenPath.join('.') === oldKey) setSelectedTokenPath(newPath);
      // Keep the renamed group expanded if it was.
      setExpandedGroups((prev) => {
        if (!prev.has(oldKey)) return prev;
        const out = new Set(prev);
        out.delete(oldKey);
        out.add(newPath.join('.'));
        return out;
      });
      if (aliasesUpdated > 0) {
        setToast({ msg: `Renamed — ${aliasesUpdated} alias${aliasesUpdated > 1 ? 'es' : ''} updated` });
      }
    } catch (e: any) {
      alert(e.message || 'Erreur lors du renommage');
    }
  };

  const handleMoveNode = (
    fromPath: string[],
    toParentPath: string[],
    placement?: { beforeName?: string; afterName?: string }
  ) => {
    if (!tree) return;
    const next = cloneTree(tree);
    try {
      const { aliasesUpdated, newPath } = moveNode(next, fromPath, toParentPath, placement);
      setTree(next);
      const oldKey = fromPath.join('.');
      if (sidebarPath.join('.') === oldKey) setSidebarPath(newPath);
      if (selectedTokenPath && selectedTokenPath.join('.') === oldKey) setSelectedTokenPath(newPath);
      setExpandedGroups((prev) => {
        if (!prev.has(oldKey)) return prev;
        const out = new Set(prev);
        out.delete(oldKey);
        out.add(newPath.join('.'));
        return out;
      });
      if (aliasesUpdated > 0) {
        setToast({ msg: `Moved — ${aliasesUpdated} alias${aliasesUpdated > 1 ? 'es' : ''} updated` });
      }
    } catch (e: any) {
      alert(e.message || 'Erreur lors du déplacement');
    }
  };

  // Duplicate a token OR a group. Auto-suffix the name to avoid collision.
  const handleDuplicateNode = (path: string[]) => {
    if (!tree || path.length === 0) return;
    const node = getNodeAt(tree, path);
    if (!node) return;
    const parentPath = path.slice(0, -1);
    const parent = parentPath.length === 0 ? (tree as any) : getNodeAt(tree, parentPath);
    if (!parent || typeof parent !== 'object') return;
    const baseName = path[path.length - 1];
    let candidate = `${baseName}-copy`;
    let i = 2;
    while (parent[candidate] !== undefined) {
      candidate = `${baseName}-copy-${i++}`;
    }
    const next = cloneTree(tree);
    const nextParent: any =
      parentPath.length === 0 ? (next as any) : getNodeAt(next, parentPath);
    nextParent[candidate] = JSON.parse(JSON.stringify(node));
    setTree(next);
    setSidebarPath([...parentPath, candidate]);
  };

  // Inline add from the sidebar tree (no modal). For tokens we route to the
  // existing AddTokenModal because the value editor lives there.
  const handleSidebarAddGroup = (parentPath: string[], name: string) => {
    if (!tree) return;
    const next = cloneTree(tree);
    try {
      addGroup(next, parentPath, name);
      setTree(next);
      // Expand the parent so the new group is visible.
      const parentKey = parentPath.join('.');
      if (parentPath.length > 0 && !expandedGroups.has(parentKey)) {
        setExpandedGroups((prev) => {
          const out = new Set(prev);
          out.add(parentKey);
          return out;
        });
      }
    } catch (e: any) {
      alert(e.message || 'Erreur');
    }
  };

  const handleSidebarAddToken = (parentPath: string[]) => {
    setAddTokenModal({ initialPath: parentPath });
  };

  // ----- Save / PR / Export -----

  const diff = useMemo(() => {
    if (!originalTree || !tree) return null;
    return computeDiff(originalTree, tree);
  }, [originalTree, tree]);

  const hasChanges = diff && totalChanges(diff) > 0;

  const handleSaveClick = () => {
    if (isLocal) {
      // Direct save, no modal needed
      void handleSaveLocal();
    } else {
      setShowSaveModal(true);
    }
  };

  const handleSaveLocal = async () => {
    if (!tree) return;
    await window.api.saveLocal({ projectId: project.id, tokens: tree });
    setOriginalTree(cloneTree(tree));
    setToast({ msg: 'Sauvegardé localement' });
  };

  const handleConfirmSavePR = async (message: string, description: string) => {
    if (!tree) return;
    const result = await window.api.createPR({
      projectId: project.id,
      tokens: tree,
      message,
      description,
    });
    setShowSaveModal(false);
    setToast({ msg: `PR #${result.number} créée`, url: result.url });
    setOriginalTree(cloneTree(tree));
  };

  const handleExport = async () => {
    if (!tree) return;
    const res = await window.api.exportJson({
      projectId: project.id,
      tokens: tree,
      suggestedName: `${project.name}.tokens.json`,
    });
    if (!res.canceled) {
      setToast({ msg: `Exporté → ${res.filePath}` });
    }
  };

  const handleRevert = async (sha: string, shortSha: string) => {
    const result = await window.api.revertToCommit({
      projectId: project.id,
      sha,
      message: `Revert tokens to ${shortSha}`,
    });
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

  if (loading) return <div className="loading-screen">Chargement des tokens…</div>;
  if (error) {
    return (
      <div className="error-screen">
        <h2>Erreur</h2>
        <p>{error}</p>
        <button onClick={onBackToProjects}>← Projets</button>
        <button onClick={reload}>Réessayer</button>
      </div>
    );
  }
  if (!tree || !originalTree) return null;

  const flatTokens = flattenTokens(tree);
  const allTokenNames = getAllTokenNames(tree);
  const originalFlatMap = new Map(flattenTokens(originalTree).map((t) => [t.fullName, t]));

  const sidebarPrefix = sidebarPath.join('.');
  const filtered = flatTokens.filter((t) => {
    if (sidebarPrefix && !t.fullName.startsWith(sidebarPrefix + '.') && t.fullName !== sidebarPrefix) {
      return false;
    }
    if (!matchesFilter(t, typeFilter)) return false;
    if (search && !t.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = groupByParent(filtered);

  const selectedToken = selectedTokenPath
    ? flatTokens.find((t) => t.fullName === selectedTokenPath.join('.')) || null
    : null;

  const refCounts = computeRefCounts(tree, flatTokens);
  const brokenAliases = findBrokenAliases(tree);
  const emptyValueCount = flatTokens.reduce((n, t) => {
    const hasEmptyMain = tokenHasEmptyValue(t.value);
    const hasEmptyModes = t.modes && (tokenHasEmptyValue(t.modes.light) || tokenHasEmptyValue(t.modes.dark));
    return hasEmptyMain || hasEmptyModes ? n + 1 : n;
  }, 0);

  return (
    <div className={`app-v2 ${selectedToken ? 'has-inspector' : ''}`}>
      <header className="app-header-v2">
        <div className="header-title">
          <button className="back-btn" onClick={onBackToProjects} title="Retour aux projets">
            ←
          </button>
          <h1>{project.name}</h1>
          <span className={`source-badge source-${project.source}`}>{project.source}</span>
          {project.source === 'github' && project.github && (
            <span className="header-meta">
              {project.github.owner}/{project.github.repo} <span className="muted">·</span>{' '}
              {project.github.branch}
            </span>
          )}
          {isLocal && (
            <span className={`autosave-pill autosave-${autoSaveStatus}`}>
              {autoSaveStatus === 'pending' && '✎ Modifications en cours…'}
              {autoSaveStatus === 'saving' && '⟳ Sauvegarde…'}
              {autoSaveStatus === 'saved' && '✓ Sauvegardé'}
              {autoSaveStatus === 'idle' && '✓ À jour'}
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
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Annuler (⌘Z)"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Rétablir (⇧⌘Z)"
          >
            ↷
          </button>
          <button onClick={handleExport} title="Exporter en JSON">⇩ Export</button>
          {!isLocal && (
            <button onClick={() => setShowHistory(true)} title="Historique">⏱</button>
          )}
          <button onClick={reload} title="Recharger">⟳</button>
          <button onClick={() => setShowSettings(true)} title="Paramètres du projet">⚙</button>
        </div>
      </header>

      <StatsStrip
        tokens={flatTokens}
        diff={diff}
        brokenCount={brokenAliases.size}
        emptyCount={emptyValueCount}
      />

      <SidebarTree
        tree={tree}
        selectedPath={sidebarPath}
        onSelect={(p) => setSidebarPath(p)}
        expanded={expandedGroups}
        onToggle={toggleGroup}
        onRename={handleRenameNode}
        onMove={handleMoveNode}
        onAddGroup={handleSidebarAddGroup}
        onAddToken={handleSidebarAddToken}
        onDuplicate={handleDuplicateNode}
        onDelete={handleSidebarDelete}
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
            const meta = new Map<
              string,
              {
                isModified: boolean;
                isAdded: boolean;
                refCount: number;
                brokenAliases?: string[];
                hasEmpty?: boolean;
              }
            >();
            for (const t of group.tokens) {
              const original = originalFlatMap.get(t.fullName);
              const isModified =
                !!original &&
                (JSON.stringify(original.value) !== JSON.stringify(t.value) ||
                  JSON.stringify(original.modes ?? null) !== JSON.stringify(t.modes ?? null));
              const hasEmptyMain = tokenHasEmptyValue(t.value);
              const hasEmptyModes =
                t.modes && (tokenHasEmptyValue(t.modes.light) || tokenHasEmptyValue(t.modes.dark));
              meta.set(t.fullName, {
                isModified,
                isAdded: !original,
                refCount: refCounts.get(t.fullName) || 0,
                brokenAliases: brokenAliases.get(t.fullName),
                hasEmpty: hasEmptyMain || !!hasEmptyModes,
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
                  selected={multiSelected}
                  onToggleSelect={toggleMultiSelect}
                  onToggleSelectAll={toggleMultiSelectAll}
                />
              </section>
            );
          })}
          {filtered.length === 0 && (
            <div className="empty-state">
              {flatTokens.length === 0
                ? 'Ce projet est vide. Clique sur "+ Add" pour créer ton premier token ou groupe.'
                : 'Aucun token ne correspond aux filtres.'}
            </div>
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

      {multiSelected.size > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-summary">
            <span className="bulk-bar-count">{multiSelected.size} token(s) sélectionné(s)</span>
          </div>
          <div className="bulk-bar-actions">
            <button onClick={clearMultiSelect}>Désélectionner</button>
            <button className="danger" onClick={handleBulkDelete}>
              🗑 Supprimer
            </button>
          </div>
        </div>
      )}

      {hasChanges && !isLocal && (
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
            <button className="primary" onClick={handleSaveClick}>
              {isLocal ? 'Sauvegarder' : 'Créer une PR'}
            </button>
          </div>
        </div>
      )}

      {showSaveModal && diff && (
        <SaveModal
          diff={diff}
          onConfirm={handleConfirmSavePR}
          onCancel={() => setShowSaveModal(false)}
        />
      )}
      {showHistory && !isLocal && (
        <HistoryView onRevert={handleRevert} onClose={() => setShowHistory(false)} />
      )}
      {showSettings && (
        <ProjectSettingsModal
          project={project}
          currentTokens={tree || {}}
          onCancel={() => setShowSettings(false)}
          onSaved={(updated) => {
            setShowSettings(false);
            onProjectChange(updated);
            setToast({ msg: 'Paramètres enregistrés' });
            void reload();
          }}
          onMigrated={(updated, prUrl) => {
            setShowSettings(false);
            onProjectChange(updated);
            // After migration the project is now GitHub-sourced.
            // Mark the tree as saved (it's the source of truth pushed to the new branch).
            setOriginalTree(cloneTree(tree || {}));
            setToast({ msg: `Migration lancée — PR ouverte`, url: prUrl });
          }}
        />
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
      {deleteRefsModal && (
        <DeleteWithRefsModal
          targetPath={deleteRefsModal.targetPath}
          refs={deleteRefsModal.refs}
          onJumpToToken={(fullName) => {
            const p = fullName.split('.');
            setSelectedTokenPath(p);
            // Set sidebar context to the parent so the table is filtered nearby.
            setSidebarPath(p.slice(0, -1));
            // Auto-expand ancestors so the row is visible.
            setExpandedGroups((prev) => {
              const out = new Set(prev);
              for (let i = 1; i <= p.length - 1; i++) out.add(p.slice(0, i).join('.'));
              return out;
            });
          }}
          onClose={() => setDeleteRefsModal(null)}
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
          {!toast.url && <button onClick={() => setToast(null)}>OK</button>}
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
