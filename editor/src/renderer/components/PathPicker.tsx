import React, { useState } from 'react';
import { TokenFile } from '../../shared/types';
import { getChildrenAt, ALL_LAYERS } from '../utils/tokenTree';

interface Props {
  tree: TokenFile;
  /** Path the picker starts with. Empty = pick layer first. */
  initialPath: string[];
  /** Called whenever the path changes (existing or pending new segments). */
  onChange: (path: string[]) => void;
  /** Smallest allowed depth (e.g. 2 to force a layer + category minimum). */
  minDepth?: number;
}

/**
 * Cascading path picker. At each level:
 * - dropdown of existing groups
 * - or "+ Nouveau groupe…" → free-text input that appends a new (pending) segment
 *
 * Returns the assembled path via onChange. The parent decides how to use it
 * (for adding a token at this group, or for adding a sub-group, etc.).
 */
export const PathPicker: React.FC<Props> = ({ tree, initialPath, onChange, minDepth = 1 }) => {
  const [path, setPath] = useState<string[]>(initialPath);
  const [newSegmentInput, setNewSegmentInput] = useState<{ depth: number; value: string } | null>(
    null
  );

  const updatePath = (next: string[]) => {
    setPath(next);
    onChange(next);
  };

  const renderLevel = (depth: number) => {
    const parentPath = path.slice(0, depth);
    const children = getChildrenAt(tree, parentPath).filter((c) => c.isGroup);
    const selected = path[depth];

    // Inline input mode (creating a new segment at this depth)
    if (newSegmentInput && newSegmentInput.depth === depth) {
      return (
        <div className="path-segment">
          <input
            type="text"
            autoFocus
            placeholder="Nom du groupe"
            value={newSegmentInput.value}
            onChange={(e) => setNewSegmentInput({ depth, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = newSegmentInput.value.trim();
                if (!name) return;
                // Collision check
                if (children.some((c) => c.name === name)) {
                  alert(`Un groupe "${name}" existe déjà à ce niveau.`);
                  return;
                }
                updatePath([...parentPath, name]);
                setNewSegmentInput(null);
              } else if (e.key === 'Escape') {
                setNewSegmentInput(null);
              }
            }}
            onBlur={() => {
              const name = newSegmentInput.value.trim();
              if (name && !children.some((c) => c.name === name)) {
                updatePath([...parentPath, name]);
              }
              setNewSegmentInput(null);
            }}
          />
        </div>
      );
    }

    return (
      <div className="path-segment">
        <select
          value={selected || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__NEW__') {
              setNewSegmentInput({ depth, value: '' });
              return;
            }
            if (v === '') {
              updatePath(parentPath);
            } else {
              updatePath([...parentPath, v]);
            }
          }}
        >
          <option value="">— sélectionner —</option>
          {children.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value="__NEW__">+ Nouveau groupe…</option>
        </select>
      </div>
    );
  };

  // Build the list of levels to display: one per existing path segment + one to pick the next
  const levels: number[] = [];
  for (let i = 0; i <= path.length; i++) levels.push(i);

  // Special case: at depth 0, show layer selector instead of children of root
  return (
    <div className="path-picker">
      {/* Layer level (depth 0) — restricted to known layers */}
      <div className="path-segment">
        <select
          value={path[0] || ''}
          onChange={(e) => {
            const v = e.target.value;
            updatePath(v ? [v] : []);
          }}
        >
          <option value="">— layer —</option>
          {ALL_LAYERS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Subsequent levels */}
      {path.length >= 1 && levels.slice(1).map((depth) => <React.Fragment key={depth}>{renderLevel(depth)}</React.Fragment>)}

      <div className="path-preview">
        <span className="muted">Chemin :</span>{' '}
        <span className="mono">{path.join('.') || '—'}</span>
      </div>
    </div>
  );
};
