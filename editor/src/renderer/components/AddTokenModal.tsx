import React, { useState } from 'react';
import { TokenFile, Token, TokenType } from '../../shared/types';
import { isGroup, getNodeAt, getAllTokenNames } from '../utils/tokenTree';
import { PathPicker } from './PathPicker';
import { ValueEditor } from './ValueEditor';

interface Props {
  tree: TokenFile;
  initialPath: string[];
  onConfirm: (parentPath: string[], name: string, token: Token) => void;
  onCancel: () => void;
}

const TOKEN_TYPES: TokenType[] = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'duration',
  'cubicBezier',
  'shadow',
  'typography',
  'border',
  'string',
  'number',
];

/**
 * Default literal value for a fresh token of a given type.
 */
function defaultValueFor(type: TokenType, withModes: boolean): any {
  if (type === 'color') {
    return withModes ? { light: '#000000', dark: '#FFFFFF' } : '#000000';
  }
  if (type === 'dimension' || type === 'fontSize') return '0px';
  if (type === 'fontWeight' || type === 'number') return 400;
  if (type === 'lineHeight' || type === 'letterSpacing') return '100%';
  if (type === 'duration') return '0ms';
  if (type === 'cubicBezier') return [0, 0, 1, 1];
  if (type === 'fontFamily') return '';
  if (type === 'shadow') {
    return {
      color: '#00000040',
      offsetX: '0px',
      offsetY: '2px',
      blur: '4px',
      spread: '0px',
    };
  }
  if (type === 'typography') {
    return {
      fontFamily: '',
      fontWeight: 400,
      fontSize: '16px',
      lineHeight: '150%',
    };
  }
  if (type === 'border') {
    return { color: '#000000', width: '1px', style: 'solid' };
  }
  return '';
}

export const AddTokenModal: React.FC<Props> = ({ tree, initialPath, onConfirm, onCancel }) => {
  const [parentPath, setParentPath] = useState<string[]>(initialPath);
  const [name, setName] = useState('');
  const [type, setType] = useState<TokenType>('color');
  const [withModes, setWithModes] = useState(false);
  const [value, setValue] = useState<any>(defaultValueFor('color', false));
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const allTokenNames = getAllTokenNames(tree);

  const parentNode = getNodeAt(tree, parentPath);
  const parentIsGroup = parentPath.length > 0 && isGroup(parentNode);
  // A "pending" group is OK too (path with new segment that doesn't exist yet)
  const parentIsPending = parentPath.length > 0 && !parentNode;

  const handleTypeChange = (t: TokenType) => {
    setType(t);
    setValue(defaultValueFor(t, withModes && t === 'color'));
    if (t !== 'color') setWithModes(false);
  };

  const handleModesToggle = (next: boolean) => {
    setWithModes(next);
    if (type === 'color') {
      if (next && (typeof value !== 'object' || !value || !('light' in value))) {
        setValue({ light: typeof value === 'string' ? value : '#000000', dark: '#FFFFFF' });
      } else if (!next && value && typeof value === 'object' && 'light' in value) {
        setValue(value.light || '#000000');
      }
    }
  };

  const canSubmit =
    parentPath.length >= 1 &&
    (parentIsGroup || parentIsPending) &&
    name.trim().length > 0 &&
    !!type;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const trimmed = name.trim();
    if (parentIsGroup && parentNode[trimmed] !== undefined) {
      setError(`Un token ou groupe nommé "${trimmed}" existe déjà à cet emplacement.`);
      return;
    }
    const token: Token = { $type: type, $value: value };
    if (description.trim()) token.$description = description.trim();
    try {
      onConfirm(parentPath, trimmed, token);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide add-token-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ajouter un token</h2>

        <div className="form-group">
          <label>Emplacement</label>
          <PathPicker tree={tree} initialPath={initialPath} onChange={setParentPath} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="add-token-name">Nom du token</label>
            <input
              id="add-token-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. brand-500"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="add-token-type">Type</label>
            <select
              id="add-token-type"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as TokenType)}
            >
              {TOKEN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {type === 'color' && (
          <div className="form-group inline">
            <label>
              <input
                type="checkbox"
                checked={withModes}
                onChange={(e) => handleModesToggle(e.target.checked)}
              />{' '}
              Mode light + dark
            </label>
          </div>
        )}

        <div className="form-group">
          <label>Valeur</label>
          <ValueEditor
            value={value}
            type={type}
            allTokenNames={allTokenNames}
            onChange={setValue}
          />
        </div>

        <div className="form-group">
          <label htmlFor="add-token-desc">Description (optionnel)</label>
          <textarea
            id="add-token-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
