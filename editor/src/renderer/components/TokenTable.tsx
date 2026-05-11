import React, { useState } from 'react';
import { FlatToken, TokenFile } from '../../shared/types';
import { resolveValue, isAlias } from '../utils/tokenTree';
import { TokenValueCell } from './TokenValueCell';

interface RowMeta {
  isModified: boolean;
  isAdded: boolean;
  refCount: number;
}

interface Props {
  tokens: FlatToken[];
  tree: TokenFile;
  meta: Map<string, RowMeta>;
  selectedPath: string | null;
  onSelect: (path: string[]) => void;
  onValueChange: (path: string[], value: any) => void;
  onDescriptionChange: (path: string[], description: string) => void;
  onRename: (oldPath: string[], newName: string) => void;
  onDelete: (path: string[]) => void;
}

const COMPLEX_TYPES = new Set(['typography', 'shadow', 'border']);

/**
 * Tabular view of tokens — Name / Value / Resolved / Type / Description / Actions.
 * Inline editing for simple types; complex types (typography, shadow) open the side
 * inspector when clicked.
 */
export const TokenTable: React.FC<Props> = ({
  tokens,
  tree,
  meta,
  selectedPath,
  onSelect,
  onValueChange,
  onDescriptionChange,
  onRename,
  onDelete,
}) => {
  return (
    <div className="token-table-wrap">
      <table className="token-table">
        <thead>
          <tr>
            <th className="th-name">Name</th>
            <th className="th-value">Value</th>
            <th className="th-resolved">Resolved value</th>
            <th className="th-type">Type</th>
            <th className="th-desc">Description</th>
            <th className="th-actions" />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const m = meta.get(t.fullName);
            const status = m?.isAdded ? 'added' : m?.isModified ? 'modified' : '';
            const isSelected = selectedPath === t.fullName;
            const isComplex = COMPLEX_TYPES.has(t.type || '');
            return (
              <tr
                key={t.fullName}
                className={`tr-token ${status} ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(t.path)}
              >
                <td className="td-name">
                  <span className="td-name-prefix">{t.path.slice(0, -1).join('.')}.</span>
                  <NameInput token={t} onRename={onRename} />
                  {m?.refCount ? <span className="td-name-refs" title={`${m.refCount} ref(s)`}>↩{m.refCount}</span> : null}
                </td>
                <td className="td-value">
                  <TokenValueCell
                    token={t}
                    tree={tree}
                    onValueChange={onValueChange}
                    onOpenInspector={() => onSelect(t.path)}
                  />
                </td>
                <td className="td-resolved">
                  <ResolvedValue token={t} tree={tree} />
                </td>
                <td className="td-type">
                  <span className="type-chip">{t.type || ''}</span>
                </td>
                <td className="td-desc">
                  <DescriptionInput
                    value={t.description || ''}
                    onChange={(v) => onDescriptionChange(t.path, v)}
                  />
                </td>
                <td className="td-actions">
                  <button
                    className="row-action"
                    title={isComplex ? 'Ouvrir le panneau' : 'Détails'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(t.path);
                    }}
                  >
                    ⋯
                  </button>
                  <button
                    className="row-action danger"
                    title="Supprimer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.path);
                    }}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const NameInput: React.FC<{ token: FlatToken; onRename: (oldPath: string[], newName: string) => void }> = ({
  token,
  onRename,
}) => {
  const lastSeg = token.path[token.path.length - 1];
  const [local, setLocal] = useState(lastSeg);
  React.useEffect(() => setLocal(lastSeg), [token.fullName, lastSeg]);
  const commit = () => {
    const trimmed = local.trim();
    if (!trimmed) {
      setLocal(lastSeg);
      return;
    }
    if (trimmed !== lastSeg) onRename(token.path, trimmed);
  };
  return (
    <input
      type="text"
      className="name-input"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setLocal(lastSeg);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

const DescriptionInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [local, setLocal] = useState(value);
  React.useEffect(() => setLocal(value), [value]);
  return (
    <input
      type="text"
      className="desc-input"
      placeholder="—"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onChange(local);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

const ResolvedValue: React.FC<{ token: FlatToken; tree: TokenFile }> = ({ token, tree }) => {
  const v = token.value;
  // For mode-typed values (light/dark), resolve each side
  if (v && typeof v === 'object' && !Array.isArray(v) && ('light' in v || 'dark' in v)) {
    const rl = resolveValue(v.light, tree);
    const rd = resolveValue(v.dark, tree);
    return (
      <div className="resolved-modes">
        <ResolvedAtom value={rl} type={token.type} />
        <ResolvedAtom value={rd} type={token.type} />
      </div>
    );
  }
  if (typeof v === 'string' && isAlias(v)) {
    const resolved = resolveValue(v, tree);
    return <ResolvedAtom value={resolved} type={token.type} />;
  }
  if (v && typeof v === 'object') {
    const resolved = resolveValue(v, tree);
    return <span className="resolved-inline">{summarizeObject(resolved, token.type)}</span>;
  }
  return <ResolvedAtom value={v} type={token.type} />;
};

const ResolvedAtom: React.FC<{ value: any; type?: string }> = ({ value, type }) => {
  if (type === 'color' && typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())) {
    return (
      <span className="resolved-atom">
        <span className="resolved-swatch" style={{ background: value }} />
        <span className="resolved-text mono">{value}</span>
      </span>
    );
  }
  return <span className="resolved-text mono">{String(value ?? '—')}</span>;
};

function summarizeObject(o: any, type?: string): string {
  if (!o) return '—';
  if (type === 'typography') {
    const parts = [];
    if (o.fontFamily) parts.push(o.fontFamily);
    if (o.fontWeight) parts.push(`w${o.fontWeight}`);
    if (o.fontSize) parts.push(o.fontSize);
    if (o.lineHeight) parts.push(`lh ${o.lineHeight}`);
    return parts.join(' · ');
  }
  if (type === 'shadow') {
    return `${o.offsetX || 0} ${o.offsetY || 0} ${o.blur || 0} ${o.color || ''}`;
  }
  return JSON.stringify(o);
}
