import React, { useState, useEffect } from 'react';
import { FlatToken, TokenFile } from '../../shared/types';
import { findReferences, getCompatibleAliasNames } from '../utils/tokenTree';
import { ValueEditor } from './ValueEditor';

interface Props {
  token: FlatToken;
  tree: TokenFile;
  allTokenNames: string[];
  onClose: () => void;
  onRename: (oldPath: string[], newName: string) => void;
  onValueChange: (path: string[], value: any) => void;
  onValueChangeMode: (path: string[], mode: 'light' | 'dark', value: any) => void;
  onDelete: (path: string[]) => void;
  onSelectToken: (path: string[]) => void;
}

export const TokenInspector: React.FC<Props> = ({
  token,
  tree,
  allTokenNames,
  onClose,
  onRename,
  onValueChange,
  onValueChangeMode,
  onDelete,
  onSelectToken,
}) => {
  const lastSeg = token.path[token.path.length - 1];
  const [editingName, setEditingName] = useState(lastSeg);
  // Restrict alias suggestions to tokens matching the current token's type,
  // and exclude self. Computed from `tree` rather than the (already-flattened)
  // `allTokenNames` prop so the type info is available.
  const aliasCandidates = React.useMemo(
    () => getCompatibleAliasNames(tree, token.type, token.fullName),
    [tree, token.type, token.fullName]
  );

  useEffect(() => {
    setEditingName(lastSeg);
  }, [token.fullName, lastSeg]);

  const commitRename = () => {
    if (editingName !== lastSeg && editingName.trim()) {
      onRename(token.path, editingName.trim());
    } else {
      setEditingName(lastSeg);
    }
  };

  // Mirror the AddTokenModal's "Mode light + dark" checkbox: toggling promotes
  // a single value to { light, dark } and vice versa. Operates on token.value
  // (the $value-based pair shape) — the legacy $extensions.modes path is left
  // untouched and stays editable via the side-by-side rows above.
  const handleToggleColorModes = (next: boolean) => {
    const current = token.value;
    const currentIsPair = isColorPair(current);
    if (next === currentIsPair) return;
    if (next) {
      const lightSeed =
        typeof current === 'string' && current.trim().length > 0 ? current : '#000000';
      onValueChange(token.path, { light: lightSeed, dark: '#FFFFFF' });
    } else {
      const fallback = currentIsPair ? current.light || '#000000' : '#000000';
      onValueChange(token.path, fallback);
    }
  };

  const refs = findReferences(tree, token.fullName);

  return (
    <aside className="token-inspector">
      <header className="inspector-header">
        <div className="inspector-breadcrumb">
          {token.path.slice(0, -1).map((seg, i) => (
            <React.Fragment key={i}>
              <span className="breadcrumb-seg">{seg}</span>
              <span className="breadcrumb-sep">/</span>
            </React.Fragment>
          ))}
        </div>
        <button className="icon-btn" onClick={onClose} title="Fermer">✕</button>
      </header>

      <div className="inspector-section">
        <label className="inspector-label">Nom</label>
        <input
          type="text"
          className="inspector-name-input"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setEditingName(lastSeg);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {token.type && <span className="inspector-type-badge">{token.type}</span>}
      </div>

      <div className="inspector-section">
        <label className="inspector-label">Valeur</label>
        {token.type === 'color' && (
          <div className="inspector-mode-toggle">
            <label>
              <input
                type="checkbox"
                checked={isColorPair(token.value) || !!token.modes}
                onChange={(e) => handleToggleColorModes(e.target.checked)}
              />{' '}
              Mode light + dark
            </label>
          </div>
        )}
        {token.modes ? (
          <>
            <div className="mode-row">
              <span className="mode-label">light</span>
              <ValueEditor
                value={token.modes.light}
                type={token.type}
                allTokenNames={aliasCandidates}
                onChange={(v) => onValueChangeMode(token.path, 'light', v)}
              />
            </div>
            <div className="mode-row">
              <span className="mode-label">dark</span>
              <ValueEditor
                value={token.modes.dark}
                type={token.type}
                allTokenNames={aliasCandidates}
                onChange={(v) => onValueChangeMode(token.path, 'dark', v)}
              />
            </div>
          </>
        ) : (
          <ValueEditor
            value={token.value}
            type={token.type}
            allTokenNames={aliasCandidates}
            onChange={(v) => onValueChange(token.path, v)}
          />
        )}
      </div>

      {token.description && (
        <div className="inspector-section">
          <label className="inspector-label">Description</label>
          <p className="inspector-description">{token.description}</p>
        </div>
      )}

      {refs.length > 0 && (
        <div className="inspector-section">
          <label className="inspector-label">Référencé par ({refs.length})</label>
          <ul className="inspector-refs">
            {refs.map((p) => (
              <li
                key={p.join('.')}
                className="inspector-ref-item"
                onClick={() => onSelectToken(p)}
              >
                {p.join('.')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="inspector-actions">
        <button className="danger" onClick={() => onDelete(token.path)} disabled={refs.length > 0}>
          {refs.length > 0 ? `Suppression bloquée (${refs.length} ref)` : 'Supprimer'}
        </button>
      </div>
    </aside>
  );
};

function isColorPair(v: any): boolean {
  return (
    v && typeof v === 'object' && !Array.isArray(v) && ('light' in v || 'dark' in v)
  );
}
