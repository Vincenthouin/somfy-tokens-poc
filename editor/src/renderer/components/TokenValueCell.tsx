import React from 'react';
import { FlatToken, TokenFile } from '../../shared/types';
import { isAlias, aliasTarget } from '../utils/tokenTree';

interface Props {
  token: FlatToken;
  tree: TokenFile;
  onValueChange: (path: string[], value: any) => void;
  onOpenInspector: () => void;
}

const COMPLEX_TYPES = new Set(['typography', 'shadow', 'border']);

/**
 * Cell rendering the raw value of a token in the table.
 * - Simple types (color, dimension, number, fontWeight, fontFamily, string): inline editor
 * - Complex types (typography, shadow, border): preview of sub-properties + click opens inspector
 * - Aliases: shown as a pill with the target path (clicking opens inspector for full editing)
 */
export const TokenValueCell: React.FC<Props> = ({ token, tree: _tree, onValueChange, onOpenInspector }) => {
  const v = token.value;
  const type = token.type;

  // Color with light/dark modes
  if (type === 'color' && v && typeof v === 'object' && !Array.isArray(v) && ('light' in v || 'dark' in v)) {
    return (
      <div className="value-cell">
        <ColorInline value={v.light} onChange={(nv) => onValueChange(token.path, { ...v, light: nv })} label="light" />
        <ColorInline value={v.dark} onChange={(nv) => onValueChange(token.path, { ...v, dark: nv })} label="dark" />
      </div>
    );
  }

  // Single color
  if (type === 'color' && typeof v === 'string') {
    if (isAlias(v)) {
      return <AliasPill value={v} onClick={onOpenInspector} />;
    }
    return (
      <div className="value-cell">
        <ColorInline value={v} onChange={(nv) => onValueChange(token.path, nv)} />
      </div>
    );
  }

  // Dimension / fontSize / lineHeight / letterSpacing / duration → text input
  if ((type === 'dimension' || type === 'fontSize' || type === 'lineHeight' || type === 'letterSpacing' || type === 'duration') && typeof v === 'string') {
    if (isAlias(v)) return <AliasPill value={v} onClick={onOpenInspector} />;
    return (
      <input
        type="text"
        className="value-input"
        value={v}
        onChange={(e) => onValueChange(token.path, e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // Number / fontWeight
  if ((type === 'number' || type === 'fontWeight') && typeof v === 'number') {
    return (
      <input
        type="number"
        className="value-input value-input-num"
        value={v}
        step="any"
        onChange={(e) => onValueChange(token.path, parseFloat(e.target.value))}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  if ((type === 'number' || type === 'fontWeight') && typeof v === 'string' && isAlias(v)) {
    return <AliasPill value={v} onClick={onOpenInspector} />;
  }

  // fontFamily / string
  if ((type === 'fontFamily' || type === 'string') && typeof v === 'string') {
    if (isAlias(v)) return <AliasPill value={v} onClick={onOpenInspector} />;
    return (
      <input
        type="text"
        className="value-input"
        value={v}
        onChange={(e) => onValueChange(token.path, e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // Complex types: typography / shadow → multi-row preview, click opens inspector
  if (COMPLEX_TYPES.has(type || '') && v && typeof v === 'object') {
    return (
      <div className="value-cell value-cell-complex" onClick={onOpenInspector}>
        {Object.entries(v).map(([k, val]) => (
          <div key={k} className="value-subrow">
            <span className="subrow-icon">{iconFor(k)}</span>
            <span className="subrow-value">{renderInnerValue(val)}</span>
          </div>
        ))}
      </div>
    );
  }

  // Fallback — string
  return <span className="value-fallback">{String(v ?? '')}</span>;
};

// ---- pieces ----

const ColorInline: React.FC<{ value: string; onChange: (v: string) => void; label?: string }> = ({
  value,
  onChange,
  label,
}) => (
  <div className="color-inline" onClick={(e) => e.stopPropagation()}>
    {label && <span className="color-inline-label">{label}</span>}
    <label
      className="color-inline-swatch"
      style={{ background: isValidHex(value) ? value : 'transparent' }}
      title="Cliquer pour ouvrir le picker"
    >
      <input type="color" value={normalizeColor(value)} onChange={(e) => onChange(preserveAlpha(value, e.target.value))} />
    </label>
    <input
      type="text"
      className="value-input value-input-mono"
      value={value || ''}
      placeholder="#000000"
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const AliasPill: React.FC<{ value: string; onClick: () => void }> = ({ value, onClick }) => (
  <button className="alias-pill" onClick={onClick} title="Cliquer pour éditer">
    <span className="alias-arrow">→</span>
    <span className="alias-target">{aliasTarget(value)}</span>
  </button>
);

function iconFor(key: string): string {
  const map: { [k: string]: string } = {
    fontFamily: 'A',
    fontWeight: 'B',
    fontSize: 'Aa',
    lineHeight: '↕',
    letterSpacing: 'A↔',
    color: '●',
    offsetX: '⇒',
    offsetY: '⇓',
    blur: '~',
    spread: '⤢',
  };
  return map[key] || key.slice(0, 2);
}

function renderInnerValue(v: any): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') return JSON.stringify(v);
  return '';
}

// ---- helpers (color) ----

function isValidHex(c: string): boolean {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim());
}
function normalizeColor(c: string): string {
  if (!c) return '#000000';
  const trimmed = c.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) return '#' + trimmed.slice(1).split('').map((ch) => ch + ch).join('');
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7);
  return '#000000';
}
function preserveAlpha(original: string, picked: string): string {
  if (!original) return picked;
  const m = original.trim().match(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})$/);
  if (m) return picked + m[1];
  return picked;
}

