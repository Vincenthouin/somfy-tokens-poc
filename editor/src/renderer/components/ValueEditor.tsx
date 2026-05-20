import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isAlias, aliasTarget } from '../utils/tokenTree';

interface Props {
  value: any;
  type?: string;
  allTokenNames: string[];
  onChange: (value: any) => void;
}

export const ValueEditor: React.FC<Props> = ({ value, type, allTokenNames, onChange }) => {
  const [showAliasPicker, setShowAliasPicker] = useState(false);
  // Snapshot of the literal value at picker-open time, used to restore it on ✕.
  // Null when the picker was opened from an already-aliased value.
  const [originalLiteral, setOriginalLiteral] = useState<any>(null);

  const valueIsAlias = isAlias(value);

  // Detect color object {light, dark}
  const isColorPair =
    type === 'color' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('light' in value || 'dark' in value);

  const openPicker = () => {
    setOriginalLiteral(valueIsAlias ? null : value);
    setShowAliasPicker(true);
  };

  // Convert the value back to a sensible literal default. Called when the user
  // explicitly delinks from a committed alias.
  const handleSwitchToLiteral = () => {
    if (type === 'color') onChange('#000000');
    else if (type === 'dimension' || type === 'fontSize') onChange('0px');
    else if (type === 'fontWeight' || type === 'number') onChange(400);
    else onChange('');
  };

  if (showAliasPicker) {
    return (
      <AliasPicker
        currentValue={valueIsAlias ? aliasTarget(value) : ''}
        allTokenNames={allTokenNames}
        onSelect={(target) => {
          onChange(`{${target}}`);
          setShowAliasPicker(false);
          setOriginalLiteral(null);
        }}
        onCancel={() => setShowAliasPicker(false)}
        onClear={() => {
          // ✕ behavior:
          //  - opened from a literal → restore the original literal (cancel)
          //  - opened from a committed alias → délier vers la valeur littérale
          //    par défaut (unlink) so the user has a way to break the link
          //    from inside the picker too.
          if (originalLiteral !== null) {
            onChange(originalLiteral);
          } else if (valueIsAlias) {
            handleSwitchToLiteral();
          }
          setShowAliasPicker(false);
          setOriginalLiteral(null);
        }}
      />
    );
  }

  // Committed alias (not editing): pill display, click to re-open the picker.
  // A small ✕ next to the pill délie immédiatement vers une valeur littérale.
  if (valueIsAlias) {
    return (
      <div className="alias-pill-row">
        <button
          type="button"
          className="alias-pill"
          onClick={() => {
            setOriginalLiteral(null);
            setShowAliasPicker(true);
          }}
          title="Cliquer pour éditer l'alias"
        >
          <span className="alias-arrow">→</span>
          <span className="alias-target">{aliasTarget(value)}</span>
        </button>
        <button
          type="button"
          className="link-btn alias-unlink-btn"
          onClick={handleSwitchToLiteral}
          title="Délier (revenir à une valeur littérale)"
        >
          ✕
        </button>
      </div>
    );
  }

  // Color pair editor (light + dark). Each mode is independently a literal
  // hex OR an alias — the link button is per-mode so the user can alias one
  // side while keeping the other literal.
  if (isColorPair) {
    return (
      <div className="color-pair-editor">
        <ColorModeAtom
          label="Light"
          value={value.light}
          allTokenNames={allTokenNames}
          onChange={(v) => onChange({ ...value, light: v })}
        />
        <ColorModeAtom
          label="Dark"
          value={value.dark}
          allTokenNames={allTokenNames}
          onChange={(v) => onChange({ ...value, dark: v })}
        />
      </div>
    );
  }

  // Single color
  if (type === 'color' && typeof value === 'string') {
    return (
      <div className="value-editor">
        <ColorInput value={value} onChange={onChange} />
        <button className="link-btn" onClick={openPicker} title="Lier à un token">
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
        <button className="link-btn" onClick={openPicker} title="Lier à un token">
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
        <button className="link-btn" onClick={openPicker} title="Lier à un token">
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
      <button className="link-btn" onClick={openPicker} title="Lier à un token">
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

export const AliasPicker: React.FC<AliasPickerProps> = ({
  currentValue,
  allTokenNames,
  onSelect,
  onCancel,
  onClear,
}) => {
  const [query, setQuery] = useState(currentValue);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync query when the parent's currentValue changes (e.g. after clicking
  // a suggestion, the parent re-renders us with the new alias target).
  // Without this, the visible input would lag behind the actual value.
  useEffect(() => {
    setQuery(currentValue);
  }, [currentValue]);

  useEffect(() => {
    if (!currentValue) {
      setOpen(true);
      inputRef.current?.focus();
    }
  }, [currentValue]);

  // Position the suggestions popover relative to the viewport so it escapes
  // any clipping ancestor (table rows, drawers, etc.). Updates on scroll and
  // resize while the popover is open.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const matches = allTokenNames
    .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);

  const isValidTarget = allTokenNames.includes(query);

  const suggestions =
    open && matches.length > 0 && coords
      ? createPortal(
          <ul
            className="alias-suggestions"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              right: 'auto',
              // minWidth keeps the popover at least as wide as the input, but
              // longer suggestions get their full width — no horizontal scroll.
              minWidth: coords.width,
              width: 'auto',
              maxWidth: '90vw',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.map((m) => (
              <li
                key={m}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery(m);
                  onSelect(m);
                  setOpen(false);
                }}
              >
                {m}
              </li>
            ))}
          </ul>,
          document.body
        )
      : null;

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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // Same logic as the ✓ button (commit best match).
              const target = isValidTarget ? query : matches[0];
              if (target) {
                setQuery(target);
                onSelect(target);
                setOpen(false);
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {suggestions}
      </div>
      <button
        className="link-btn"
        // Enabled if either the typed query matches a token OR there's at least
        // one suggestion that we can auto-pick. This makes ✓ useful even when
        // the user types a partial path: clicking commits the best match.
        disabled={!isValidTarget && matches.length === 0}
        onClick={() => {
          const target = isValidTarget ? query : matches[0];
          if (!target) return;
          setQuery(target);
          onSelect(target);
          setOpen(false);
        }}
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

// ----- Single-mode color atom (literal OR alias, with link button) -----
// Used inside the color pair editor so each mode (light, dark) can be aliased
// or literal independently.

interface ColorModeAtomProps {
  label: string;
  value: any;
  allTokenNames: string[];
  onChange: (v: any) => void;
}

const ColorModeAtom: React.FC<ColorModeAtomProps> = ({ label, value, allTokenNames, onChange }) => {
  const [showAliasPicker, setShowAliasPicker] = useState(false);
  // Snapshot of the literal value at picker-open time so ✕ can restore it.
  const [originalLiteral, setOriginalLiteral] = useState<string | null>(null);
  const valueIsAlias = isAlias(value);

  if (showAliasPicker) {
    return (
      <div className="color-mode-row">
        <span className="color-label">{label}</span>
        <AliasPicker
          currentValue={valueIsAlias ? aliasTarget(value) : ''}
          allTokenNames={allTokenNames}
          onSelect={(t) => {
            onChange(`{${t}}`);
            setShowAliasPicker(false);
            setOriginalLiteral(null);
          }}
          onCancel={() => setShowAliasPicker(false)}
          onClear={() => {
            if (originalLiteral !== null) onChange(originalLiteral);
            setShowAliasPicker(false);
            setOriginalLiteral(null);
          }}
        />
      </div>
    );
  }

  if (valueIsAlias) {
    return (
      <div className="color-mode-row">
        <span className="color-label">{label}</span>
        <button
          type="button"
          className="alias-pill"
          onClick={() => {
            setOriginalLiteral(null);
            setShowAliasPicker(true);
          }}
          title="Cliquer pour éditer l'alias"
        >
          <span className="alias-arrow">→</span>
          <span className="alias-target">{aliasTarget(value)}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="color-mode-row">
      <ColorInput label={label} value={value} onChange={onChange} />
      <button
        className="link-btn"
        onClick={() => {
          setOriginalLiteral(value || '#000000');
          setShowAliasPicker(true);
        }}
        title="Lier ce mode à un token"
      >
        🔗
      </button>
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
