import React from 'react';
import { FlatToken } from '../../shared/types';
import { TokenDiff, totalChanges } from '../utils/diff';

interface Props {
  tokens: FlatToken[];
  diff: TokenDiff | null;
}

const LAYER_LABELS: { [k: string]: string } = {
  primitives: 'Primitives',
  semantic: 'Semantic',
  composite: 'Composite',
  component: 'Component',
};

export const StatsStrip: React.FC<Props> = ({ tokens, diff }) => {
  const total = tokens.length;
  const byLayer = new Map<string, number>();
  for (const t of tokens) {
    byLayer.set(t.layer, (byLayer.get(t.layer) || 0) + 1);
  }
  const changes = diff ? totalChanges(diff) : 0;

  return (
    <div className="stats-strip">
      <div className="stat-card">
        <div className="stat-label">Total</div>
        <div className="stat-value">{total}</div>
      </div>
      {Object.keys(LAYER_LABELS).map((layer) => (
        <div key={layer} className="stat-card">
          <div className="stat-label">{LAYER_LABELS[layer]}</div>
          <div className="stat-value">{byLayer.get(layer) || 0}</div>
        </div>
      ))}
      {diff && changes > 0 && (
        <div className="stat-card stat-card-changes">
          <div className="stat-label">Pending changes</div>
          <div className="stat-value-row">
            {diff.added.length > 0 && <span className="stat-pill stat-added">+{diff.added.length}</span>}
            {diff.modified.length > 0 && <span className="stat-pill stat-modified">~{diff.modified.length}</span>}
            {diff.removed.length > 0 && <span className="stat-pill stat-removed">−{diff.removed.length}</span>}
          </div>
        </div>
      )}
    </div>
  );
};
