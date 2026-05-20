import React, { useState } from 'react';
import { FlatToken, TokenFile } from '../../shared/types';
import { isAlias, aliasTarget, getCompatibleAliasNames } from '../utils/tokenTree';
import { AliasPicker } from './ValueEditor';

interface Props {
  token: FlatToken;
  tree: TokenFile;
  onValueChange: (path: string[], value: any) => void;
  onOpenInspector: () => void;
}

const COMPLEX_TYPES = new Set(['typography', 'shadow', 'border']);

/**
 * Cell rendering the raw value of a token in the table.
 * - Simple types (color, dimension, number, fontWeight, fontFamily, string): inline editor + link button
 * - Color pair (light/dark): each mode has its own input + link button
 * - Complex types (typography, shadow, border): preview of sub-properties + click opens inspector
 * - Aliases: shown as a pill with the target path (clicking opens inspector for full editing)
 */
export const TokenValueCell: React.FC<Props> = ({ token, tree, onValueChange, onOpenInspector }) => {
  const v = token.value;
  const type = token.type;
  // Restrict suggestions to tokens of the same type, and exclude self —
  // aliasing a dimension to a color is nonsense and self-references cycle.
  const allTokenNames = React.useMemo(
    () => getCompatibleAliasNames(tree, type, token.fullName),
    [tree, type, token.fullName]
  );

  // Color with light/dark modes
  if (type === 'color' && v && typeof v === 'object' && !Array.isArray(v) && ('light' in v || 'dark' in v)) {
    return (
      <div className="value-cell">
        <ColorModeCell
          value={v.light}
          allTokenNames={allTokenNames}
          onChange={(nv) => onValueChange(token.path, { ...v, light: nv })}
          label="light"
        />
        <ColorModeCell
          value={v.dark}
          allTokenNames={allTokenNames}
          onChange={(nv) => onValueChange(token.path, { ...v, dark: nv })}
          label="dark"
        />
      </div>
    );
  }

  // Single color
  if (type === 'color' && typeof v === 'string') {
    return (
      <div className="value-cell">
        <ColorModeCell
          value={v}
          allTokenNames={allTokenNames}
          onChange={(nv) => onValueChange(token.path, nv)}
        />
      </div>
    );
  }

  // Dimension / fontSize / lineHeight / letterSpacing / duration → text input
  if ((type === 'dimension' || type === 'fontSize' || type === 'lineHeight' || type === 'letterSpacing' || type === 'duration') && typeof v === 'string') {
    return (
      <TextValueCell
        value={v}
        allTokenNames={allTokenNames}
        onChange={(nv) => onValueChange(token.path, nv)}
        placeholder="ex. 16px"
        defaultLiteral="0px"
      />
    );
  }

  // Number / fontWeight (numeric)
  if ((type === 'number' || type === 'fontWeight') && typeof v === 'number') {
    return (
      <NumberValueCell
        value={v}
        allTokenNames={allTokenNames}
        onChange={(nv) => onValueChange(token.path, nv)}
      />
    );
  }
  // Number / fontWeight stored as alias string
  if ((type === 'number' || type === 'fontWeight') && typeof v === 'string' && isAlias(v)) {
    return (
      <NumberValueCell
        value={v}
        allTokenNames={allTokenNames}
        onChange={(nv) => onValueChange(token.path, nv)}
      />
    );
  }

  // fontFamily / string
  if ((type === 'fontFamily' || type === 'string') && typeof v === 'string') {
    return (
      <TextValueCell
        value={v}
        allTokenNames={allTokenNames}
        onChange={(nv) => onValueChange(token.path, nv)}
        placeholder=""
        defaultLiteral=""
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

// ---- Color mode cell (literal OR alias, with link button) ----

interface ColorModeCellProps {
  value: string;
  allTokenNames: string[];
  onChange: (v: string) => void;
  label?: string;
}

const ColorModeCell: React.FC<ColorModeCellProps> = ({ value, allTokenNames, onChange, label }) => {
  const [aliasMode, setAliasMode] = useState(false);
  // Snapshot of the literal value at picker-open time so ✕ can restore it.
  // Null when the picker was opened from an already-aliased value.
  const [originalLiteral, setOriginalLiteral] = useState<string | null>(null);
  const isAliasValue = isAlias(value);

  // Picker mode: user is actively editing/picking an alias
  if (aliasMode) {
    return (
      <div className="color-inline" onClick={(e) => e.stopPropagation()}>
        {label && <span className="color-inline-label">{label}</span>}
        <AliasPicker
          currentValue={isAliasValue ? aliasTarget(value) : ''}
          allTokenNames={allTokenNames}
          onSelect={(t) => {
            onChange(`{${t}}`);
            setAliasMode(false);
            setOriginalLiteral(null);
          }}
          onCancel={() => {
            setAliasMode(false);
          }}
          onClear={() => {
            // ✕ restores the original literal when we came from a literal;
            // otherwise (came from an existing alias) it just closes the picker.
            if (originalLiteral !== null) onChange(originalLiteral);
            setAliasMode(false);
            setOriginalLiteral(null);
          }}
        />
      </div>
    );
  }

  // Pill mode: committed alias (clickable to re-open the picker). The ✕ next
  // to it délie immédiatement vers la valeur littérale par défaut.
  if (isAliasValue) {
    return (
      <div className="color-inline" onClick={(e) => e.stopPropagation()}>
        {label && <span className="color-inline-label">{label}</span>}
        <div className="alias-pill-row">
          <AliasPill
            value={value}
            onClick={() => {
              setOriginalLiteral(null);
              setAliasMode(true);
            }}
          />
          <button
            className="value-link-btn alias-unlink-btn"
            onClick={(e) => { e.stopPropagation(); onChange('#000000'); }}
            title="Délier"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Literal mode
  return (
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
      <button
        className="value-link-btn"
        title="Lier à un token"
        onClick={(e) => {
          e.stopPropagation();
          setOriginalLiteral(value || '#000000');
          setAliasMode(true);
        }}
      >
        🔗
      </button>
    </div>
  );
};

// ---- Text value cell (dimension, fontFamily, string) ----

interface TextValueCellProps {
  value: string;
  allTokenNames: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  defaultLiteral: string;
}

const TextValueCell: React.FC<TextValueCellProps> = ({ value, allTokenNames, onChange, placeholder, defaultLiteral }) => {
  const [aliasMode, setAliasMode] = useState(false);
  const [originalLiteral, setOriginalLiteral] = useState<string | null>(null);
  const isAliasValue = isAlias(value);

  if (aliasMode) {
    return (
      <div className="value-cell-inline" onClick={(e) => e.stopPropagation()}>
        <AliasPicker
          currentValue={isAliasValue ? aliasTarget(value) : ''}
          allTokenNames={allTokenNames}
          onSelect={(t) => {
            onChange(`{${t}}`);
            setAliasMode(false);
            setOriginalLiteral(null);
          }}
          onCancel={() => setAliasMode(false)}
          onClear={() => {
            if (originalLiteral !== null) onChange(originalLiteral);
            setAliasMode(false);
            setOriginalLiteral(null);
          }}
        />
      </div>
    );
  }

  if (isAliasValue) {
    return (
      <div className="value-cell-inline" onClick={(e) => e.stopPropagation()}>
        <div className="alias-pill-row">
          <AliasPill
            value={value}
            onClick={() => {
              setOriginalLiteral(null);
              setAliasMode(true);
            }}
          />
          <button
            className="value-link-btn alias-unlink-btn"
            onClick={(e) => { e.stopPropagation(); onChange(defaultLiteral); }}
            title="Délier"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="value-cell-inline" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        className="value-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        className="value-link-btn"
        title="Lier à un token"
        onClick={() => {
          setOriginalLiteral(value || defaultLiteral);
          setAliasMode(true);
        }}
      >
        🔗
      </button>
    </div>
  );
};

// ---- Number value cell (with alias support) ----

interface NumberValueCellProps {
  value: number | string;
  allTokenNames: string[];
  onChange: (v: number | string) => void;
}

const NumberValueCell: React.FC<NumberValueCellProps> = ({ value, allTokenNames, onChange }) => {
  const [aliasMode, setAliasMode] = useState(false);
  const [originalLiteral, setOriginalLiteral] = useState<number | null>(null);
  const isAliasValue = typeof value === 'string' && isAlias(value);

  if (aliasMode) {
    return (
      <div className="value-cell-inline" onClick={(e) => e.stopPropagation()}>
        <AliasPicker
          currentValue={isAliasValue ? aliasTarget(value as string) : ''}
          allTokenNames={allTokenNames}
          onSelect={(t) => {
            onChange(`{${t}}`);
            setAliasMode(false);
            setOriginalLiteral(null);
          }}
          onCancel={() => setAliasMode(false)}
          onClear={() => {
            if (originalLiteral !== null) onChange(originalLiteral);
            setAliasMode(false);
            setOriginalLiteral(null);
          }}
        />
      </div>
    );
  }

  if (isAliasValue) {
    return (
      <div className="value-cell-inline" onClick={(e) => e.stopPropagation()}>
        <div className="alias-pill-row">
          <AliasPill
            value={value as string}
            onClick={() => {
              setOriginalLiteral(null);
              setAliasMode(true);
            }}
          />
          <button
            className="value-link-btn alias-unlink-btn"
            onClick={(e) => { e.stopPropagation(); onChange(400); }}
            title="Délier"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="value-cell-inline" onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        className="value-input value-input-num"
        value={typeof value === 'number' ? value : 0}
        step="any"
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <button
        className="value-link-btn"
        title="Lier à un token"
        onClick={() => {
          setOriginalLiteral(typeof value === 'number' ? value : 400);
          setAliasMode(true);
        }}
      >
        🔗
      </button>
    </div>
  );
};

// Inline pill showing a committed alias. Click to re-open the picker for editing.
const AliasPill: React.FC<{ value: string; onClick: () => void }> = ({ value, onClick }) => (
  <button className="alias-pill" onClick={(e) => { e.stopPropagation(); onClick(); }} title="Cliquer pour éditer">
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
