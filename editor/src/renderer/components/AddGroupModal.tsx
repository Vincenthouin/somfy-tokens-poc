import React, { useState } from 'react';
import { TokenFile } from '../../shared/types';
import { isGroup, getNodeAt } from '../utils/tokenTree';
import { PathPicker } from './PathPicker';

interface Props {
  tree: TokenFile;
  initialPath: string[];
  onConfirm: (parentPath: string[], name: string) => void;
  onCancel: () => void;
}

export const AddGroupModal: React.FC<Props> = ({ tree, initialPath, onConfirm, onCancel }) => {
  const [parentPath, setParentPath] = useState<string[]>(initialPath);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parentNode = getNodeAt(tree, parentPath);
  const parentIsGroup = parentPath.length === 0 || isGroup(parentNode);
  const parentIsPending = parentPath.length > 0 && !parentNode;

  const canSubmit = (parentIsGroup || parentIsPending) && name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const trimmed = name.trim();
    if (parentIsGroup && parentNode && parentNode[trimmed] !== undefined) {
      setError(`Un token ou groupe nommé "${trimmed}" existe déjà à cet emplacement.`);
      return;
    }
    try {
      onConfirm(parentPath, trimmed);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal add-group-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ajouter un groupe</h2>

        <div className="form-group">
          <label>Parent</label>
          <PathPicker tree={tree} initialPath={initialPath} onChange={setParentPath} />
        </div>

        <div className="form-group">
          <label htmlFor="add-group-name">Nom du groupe</label>
          <input
            id="add-group-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. brand"
            autoFocus
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onCancel}>Annuler</button>
          <button className="primary" disabled={!canSubmit} onClick={handleSubmit}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
};
