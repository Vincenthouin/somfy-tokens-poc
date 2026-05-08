import React, { useState } from 'react';
import { FlatToken } from '../../shared/types';
import { ValueEditor } from './ValueEditor';

interface Props {
  token: FlatToken;
  allTokenNames: string[];
  isModified: boolean;
  isRenamed: boolean;
  referenceCount: number; // how many tokens reference this one
  onRename: (oldPath: string[], newName: string) => void;
  onValueChange: (path: string[], value: any) => void;
  onValueChangeMode: (path: string[], mode: 'light' | 'dark', value: any) => void;
}

export const TokenRow: React.FC<Props> = ({
  token,
  allTokenNames,
  isModified,
  isRenamed,
  referenceCount,
  onRename,
  onValueChange,
  onValueChangeMode,
}) => {
  // Editable last segment of the path
  const lastSeg = token.path[token.path.length - 1];
  const prefix = token.path.slice(0, -1).join('.');
  const [editingName, setEditingName] = useState(lastSeg);
  const [nameFocused, setNameFocused] = useState(false);

  const commitRename = () => {
    if (editingName !== lastSeg && editingName.trim()) {
      onRename(token.path, editingName.trim());
    } else {
      setEditingName(lastSeg);
    }
  };

  const hasModes = !!token.modes;

  return (
    <div className={`token-row ${isModified ? 'modified' : ''} ${isRenamed ? 'renamed' : ''}`}>
      <div className="token-name">
        <span className="token-prefix">{prefix}.</span>
        <input
          type="text"
          className="token-segment"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => {
            setNameFocused(false);
            commitRename();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setEditingName(lastSeg);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {referenceCount > 0 && (
          <span className="ref-count" title={`${referenceCount} token(s) référencent celui-ci`}>
            ↩ {referenceCount}
          </span>
        )}
        {token.type && <span className="token-type-badge">{token.type}</span>}
      </div>

      <div className="token-values">
        {hasModes ? (
          <>
            <div className="mode-row">
              <span className="mode-label">light</span>
              <ValueEditor
                value={token.modes!.light}
                type={token.type}
                allTokenNames={allTokenNames}
                onChange={(v) => onValueChangeMode(token.path, 'light', v)}
              />
            </div>
            <div className="mode-row">
              <span className="mode-label">dark</span>
              <ValueEditor
                value={token.modes!.dark}
                type={token.type}
                allTokenNames={allTokenNames}
                onChange={(v) => onValueChangeMode(token.path, 'dark', v)}
              />
            </div>
          </>
        ) : (
          <ValueEditor
            value={token.value}
            type={token.type}
            allTokenNames={allTokenNames}
            onChange={(v) => onValueChange(token.path, v)}
          />
        )}
      </div>
    </div>
  );
};
