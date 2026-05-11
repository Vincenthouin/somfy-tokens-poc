import React from 'react';
import { FlatToken } from '../../shared/types';
import { isAlias, aliasTarget } from '../utils/tokenTree';

interface Props {
  token: FlatToken;
  isSelected: boolean;
  isModified: boolean;
  isAdded: boolean;
  referenceCount: number;
  onClick: () => void;
}

/**
 * Compact card displayed in the main list. Visual swatch on the left,
 * full name + type badge on the right. Click to open the inspector.
 */
export const TokenCard: React.FC<Props> = ({
  token,
  isSelected,
  isModified,
  isAdded,
  referenceCount,
  onClick,
}) => {
  const status = isAdded ? 'added' : isModified ? 'modified' : '';

  return (
    <div
      className={`token-card ${isSelected ? 'selected' : ''} ${status}`}
      onClick={onClick}
    >
      <div className="token-card-swatch">{renderSwatch(token)}</div>
      <div className="token-card-main">
        <div className="token-card-name">
          <span className="token-card-prefix">{token.path.slice(0, -1).join('.')}.</span>
          <span className="token-card-leaf">{token.path[token.path.length - 1]}</span>
        </div>
        <div className="token-card-meta">
          {token.type && <span className="token-card-type">{token.type}</span>}
          <span className="token-card-value-preview">{renderValuePreview(token)}</span>
          {referenceCount > 0 && (
            <span className="token-card-refs" title={`${referenceCount} référence(s)`}>
              ↩ {referenceCount}
            </span>
          )}
        </div>
      </div>
      {status && <span className={`token-card-indicator indicator-${status}`} />}
    </div>
  );
};

function renderSwatch(token: FlatToken): React.ReactNode {
  if (token.type === 'color') {
    const v = token.modes ? token.modes.light : token.value;
    if (typeof v === 'string') return <ColorSwatch value={v} />;
    if (v && typeof v === 'object' && 'light' in v) return <ColorSwatch value={v.light} />;
    return <span className="swatch-placeholder" />;
  }
  if (token.type === 'shadow') return <ShadowSwatch value={token.value} />;
  if (token.type === 'typography') return <span className="swatch-typo">Aa</span>;
  if (token.type === 'dimension' || token.type === 'fontSize') {
    return <span className="swatch-dim">⤢</span>;
  }
  if (token.type === 'fontWeight' || token.type === 'number') {
    return <span className="swatch-num">#</span>;
  }
  return <span className="swatch-placeholder" />;
}

const ColorSwatch: React.FC<{ value: any }> = ({ value }) => {
  if (typeof value !== 'string') return <span className="swatch-placeholder" />;
  if (isAlias(value)) {
    return <span className="swatch-alias" title={`→ ${aliasTarget(value)}`}>↗</span>;
  }
  return <span className="color-swatch-mini" style={{ background: value }} />;
};

const ShadowSwatch: React.FC<{ value: any }> = () => {
  return <span className="swatch-shadow" />;
};

function renderValuePreview(token: FlatToken): string {
  const v = token.value;
  if (isAlias(v)) return `→ ${aliasTarget(v)}`;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    if ('light' in v && 'dark' in v) return `light: ${v.light} • dark: ${v.dark}`;
    if (token.type === 'typography') return `${v.fontSize || ''} ${v.fontWeight || ''}`.trim();
    return JSON.stringify(v).slice(0, 40);
  }
  return '';
}
