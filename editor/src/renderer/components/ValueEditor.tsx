import React, { useState, useRef, useEffect } from 'react';
import { isAlias, aliasTarget } from '../utils/tokenTree';

interface Props {
  value: any;
  type?: string;
  allTokenNames: string[];
  onChange: (value: any) => void;
}

export const ValueEditor: React.FC<Props> = ({ value, type, allTokenNames, onChange }) => {
  const [showAliasPicker, setShowAliasPicker] = useState(false);

  const valueIsAlias = isAlias(value);

  // Detect color object {light, dark}
  const isColorPair =
    type === 'color' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('light' in value || 'dark' in value);

  const handleSwitchToAlias = () => {
    setShowAliasPicker(true);
  };

  const handleSwitchToLiteral = () => {
    if (type === 'color') onChange('#000000');
    else if (type === 'dimension' || type === 'fontSize') onChange('0px');
    else if (type === 'fontWeight' || type === 'number') onChange(400);
    else onChange('');
  };

  if (showAliasPicker || valueIsAlias) {
    return (
      <AliasPicker
        currentValue={valueIsAlias ? aliasTarget(value) : ''}
        allTokenNames={allTokenNames}
        onSelect={(target) => {
          onChange(`{${target}}`);
          setShowAliasPicker(false);
        }}
        onCancel={() => {
          setShowAliasPicker(false);
          if (!valueIsAlias) handleSwitchToLiteral();
        }}
        onClear={handleSwitchToLiteral}
      />
    );
  }

  // Color pair editor (light + dark)
  if (isColorPair) {
    return (
      <div className="color-pair-editor">
        <ColorInput
          label="Light"
          value={value.light}
          onChange={(v) => onChange({ ...value, light: v })}
        />
        <ColorInput
          label="Dark"
          value={value.dark}
          onChange={(v) => onChange({ ...value, dark: v })}
        />
        <button className="link-btn" onClick={handleSwitchToAlias} title="Lier à un token">
          🔗
        </button>
      </div>
    );
  }

  // Single color
  if (type === 'color' && typeof value === 'string') {
    return (
      <div className="value-editor">
        <ColorInput value={value} onChange={onChange} />
        <button className="link-btn" onClick={handleSwitchToAlias} title="Lier à un token">
          🔗
        </button>
      </div>
    );
  }

  // Dimension / fontSize
  if ((type === 'dimension' || type === 'fontSize') && typeof value === 'string') {
    return (
      <div className="value-editor">
        <input
          type="text"
          className="value-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex. 16px"
        />
        <button className="link-btn" onClick={handleSwitchToAlias} title="Lier à un token">
          🔗
        </button>
      </div>
    );
  }

  // Numbers
  if (typeof value === 'number') {
    return (
      <div className="value-editor">
        <input
          type="number"
          className="value-text"
          value={value}
          step="any"
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <button className="link-btn" onClick={handleSwitchToAlias} title="Lier à un token">
          🔗
        </button>
      </div>
    );
  }

  // Generic objects (shadow, typography, border)
  if (value && typeof value === 'object') {
    return <ObjectValueEditor value={value} onChange={onChange} />;
  }

  return (
    <div className="value-editor">
      <input
        type="text"
        className="value-text"
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="link-btn" onClick={handleSwitchToAlias} title="Lier à un token">
        🔗
      </button>
    </div>
  );
};

// ----- Color input (swatch + hex) -----

interface ColorInputProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

const ColorInput: React.FC<ColorInputProps> = ({ value, onChange, label }) => {
  return (
    <div className="color-input">
      {label && <span className="color-label">{label}</span>}
      <label
        className="color-swatch"
        style={{ background: isValidHex(value) ? value : 'transparent' }}
        title="Cliquer pour ouvrir le color picker"
      >
        <input
          type="color"
          value={normalizeColor(value)}
          onChange={(e) => onChange(preserveAlpha(value, e.target.value))}
        />
      </label>
      <input
        type="text"
        className="value-text hex-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
      />
    </div>
  );
};

// ----- Alias picker -----

interface AliasPickerProps {
  currentValue: string;
  allTokenNames: string[];
  onSelect: (target: string) => void;
  onCancel: () => void;
  onClear: () => void;
}

const AliasPicker: React.FC<AliasPickerProps> = ({
  currentValue,
  allTokenNames,
  onSelect,
  onCancel,
  onClear,
}) => {
  const [query, setQuery] = useState(currentValue);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentValue) {
      setOpen(true);
      inputRef.current?.focus();
    }
  }, [currentValue]);

  const matches = allTokenNames
    .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);

  const isValidTarget = allTokenNames.includes(query);

  return (
    <div className="alias-picker">
      <span className="alias-prefix">→</span>
      <div className="alias-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="value-text alias-input"
          value={query}
          placeholder="Tape pour chercher un token…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && matches.length > 0 && (
          <ul className="alias-suggestions">
            {matches.map((m) => (
              <li
                key={m}
                onMouseDown={() => {
                  onSelect(m);
                  setOpen(false);
                }}
              >
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        className="link-btn"
        disabled={!isValidTarget}
        onClick={() => isValidTarget && onSelect(query)}
        title="Valider"
      >
        ✓
      </button>
      <button className="link-btn" onClick={onClear} title="Délier (valeur littérale)">
        ✕
      </button>
    </div>
  );
};

// ----- Object value editor (fallback for shadows, typography, border) -----

const ObjectValueEditor: React.FC<{ value: any; onChange: (v: any) => void }> = ({
  value,
  onChange,
}) => {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <div className="value-editor object-editor">
      <textarea
        className="value-text"
        value={text}
        rows={Math.min(8, text.split('\n').length)}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            setError(null);
            onChange(parsed);
          } catch (err) {
            setError('JSON invalide');
          }
        }}
      />
      {error && <span className="error">{error}</span>}
    </div>
  );
};

// ----- Helpers -----

function isValidHex(c: string): boolean {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim());
}

function normalizeColor(c: string): string {
  if (!c) return '#000000';
  const trimmed = c.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return '#' + trimmed.slice(1).split('').map((ch) => ch + ch).join('');
  }
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
