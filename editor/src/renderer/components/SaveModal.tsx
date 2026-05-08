import React, { useState } from 'react';
import { TokenDiff } from '../utils/diff';

interface Props {
  diff: TokenDiff;
  onConfirm: (message: string, description: string) => Promise<void>;
  onCancel: () => void;
}

export const SaveModal: React.FC<Props> = ({ diff, onConfirm, onCancel }) => {
  const [message, setMessage] = useState(generateDefaultMessage(diff));
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(message.trim(), description.trim());
    } catch (e: any) {
      setError(e.message || 'Erreur inconnue');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sauvegarder les modifications</h2>

        <div className="diff-summary">
          {diff.added.length > 0 && <span className="diff-added">+ {diff.added.length}</span>}
          {diff.modified.length > 0 && <span className="diff-modified">~ {diff.modified.length}</span>}
          {diff.removed.length > 0 && <span className="diff-removed">− {diff.removed.length}</span>}
        </div>

        <details className="diff-details">
          <summary>Détails du diff</summary>
          {diff.modified.map((m, i) => (
            <div key={'m' + i} className="diff-line">
              <span className="diff-tag modified">~</span>
              <code>{m.before.fullName}</code>
              {m.before.fullName !== m.after.fullName && (
                <>
                  {' → '}
                  <code>{m.after.fullName}</code>
                </>
              )}
              <span className="diff-values">
                <code>{summarize(m.before.value ?? m.before.modes)}</code>
                {' → '}
                <code>{summarize(m.after.value ?? m.after.modes)}</code>
              </span>
            </div>
          ))}
          {diff.added.map((t, i) => (
            <div key={'a' + i} className="diff-line">
              <span className="diff-tag added">+</span>
              <code>{t.fullName}</code>
            </div>
          ))}
          {diff.removed.map((t, i) => (
            <div key={'r' + i} className="diff-line">
              <span className="diff-tag removed">−</span>
              <code>{t.fullName}</code>
            </div>
          ))}
        </details>

        <label>
          Message du commit / titre PR
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="ex: Update brand colors"
          />
        </label>

        <label>
          Description (optionnelle)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Contexte, raison du changement…"
          />
        </label>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onCancel} disabled={submitting}>
            Annuler
          </button>
          <button className="primary" onClick={handleConfirm} disabled={submitting || !message.trim()}>
            {submitting ? 'Création de la PR…' : 'Créer la PR'}
          </button>
        </div>
      </div>
    </div>
  );
};

function generateDefaultMessage(diff: TokenDiff): string {
  const parts: string[] = [];
  if (diff.modified.length > 0) parts.push(`update ${diff.modified.length} token(s)`);
  if (diff.added.length > 0) parts.push(`add ${diff.added.length}`);
  if (diff.removed.length > 0) parts.push(`remove ${diff.removed.length}`);
  return parts.join(', ') || 'Edit tokens';
}

function summarize(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
