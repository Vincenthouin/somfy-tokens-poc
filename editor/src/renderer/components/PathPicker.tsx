import React, { useState } from 'react';
import { TokenFile } from '../../shared/types';
import { getChildrenAt } from '../utils/tokenTree';

interface Props {
  tree: TokenFile;
  /** Path the picker starts with. Empty = pick layer first. */
  initialPath: string[];
  /** Called whenever the path changes (existing or pending new segments). */
  onChange: (path: string[]) => void;
  /** Reserved for future depth validation — currently unused. */
  minDepth?: number;
}

/**
 * Cascading path picker. At each level:
 * - dropdown of existing groups
 * - or "+ Nouveau groupe…" → free-text input that appends a new (pending) segment
 *
 * The currently selected segment is always rendered as an option even if it isn't
 * (yet) part of the tree — so a brand new group typed via "+ Nouveau" stays visible
 * in the dropdown until the token is actually added.
 */
export const PathPicker: React.FC<Props> = ({ tree, initialPath, onChange }) => {
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
    const existing = getChildrenAt(tree, parentPath).filter((c) => c.isGroup);
    const selected = path[depth];
    const label = depth === 0 ? 'layer' : 'groupe';
    // The deepest level is the one right after the current selection — it has
    // no `selected` value and represents "go one level deeper". On that level
    // we replace the dropdown with an explicit "+ Add new subgroup" button so
    // the affordance is clearer (the dropdown is reserved for picking an
    // existing parent at intermediate levels).
    const isDeepest = selected === undefined;

    // Inline input mode (creating a new segment at this depth)
    if (newSegmentInput && newSegmentInput.depth === depth) {
      return (
        <div className="path-segment" key={`input-${depth}`}>
          <input
            type="text"
            autoFocus
            placeholder={`Nom du ${label}`}
            value={newSegmentInput.value}
            onChange={(e) => setNewSegmentInput({ depth, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const name = newSegmentInput.value.trim();
                if (!name) return;
                if (existing.some((c) => c.name === name)) {
                  alert(`Un ${label} "${name}" existe déjà à ce niveau.`);
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
              if (name && !existing.some((c) => c.name === name)) {
                updatePath([...parentPath, name]);
              }
              setNewSegmentInput(null);
            }}
          />
        </div>
      );
    }

    // Build the option list (existing groups + pending segment).
    const names = new Set(existing.map((c) => c.name));
    if (selected && !names.has(selected)) names.add(selected);

    // At the deepest level (no selection yet) — top-level or nested, same
    // pattern — pair the dropdown of existing groups with an explicit
    // "+ Nouveau" button. If no existing groups at this level, render only
    // the button (a "— groupe —" dropdown alone would be confusing).
    if (isDeepest) {
      const hasExisting = names.size > 0;
      return (
        <div className="path-segment" key={`add-${depth}`}>
          {hasExisting && (
            <select
              value={selected || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') updatePath(parentPath);
                else updatePath([...parentPath, v]);
              }}
            >
              <option value="">— {label} —</option>
              {Array.from(names).sort().map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="path-add-btn"
            onClick={() => setNewSegmentInput({ depth, value: '' })}
            title={`Créer un nouveau ${label} sous ${parentPath.join('.') || '(racine)'}`}
          >
            + Nouveau {label}
          </button>
        </div>
      );
    }

    // Intermediate levels (or top level when no layer is picked yet) keep the
    // dropdown so the user can navigate to an existing group.
    return (
      <div className="path-segment" key={`select-${depth}`}>
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
          <option value="">— {label} —</option>
          {Array.from(names).sort().map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__NEW__">+ Nouveau {label}…</option>
        </select>
      </div>
    );
  };

  // Display one segment per existing path entry + one to pick the next.
  const levels: number[] = [];
  for (let i = 0; i <= path.length; i++) levels.push(i);

  return (
    <div className="path-picker">
      {levels.map((depth) => renderLevel(depth))}
      <div className="path-preview">
        <span className="muted">Chemin :</span>{' '}
        <span className="mono">{path.join('.') || '—'}</span>
      </div>
    </div>
  );
};
