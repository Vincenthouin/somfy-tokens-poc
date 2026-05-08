import React, { useEffect, useState } from 'react';
import { CommitInfo } from '../../shared/types';

interface Props {
  onRevert: (sha: string, shortSha: string) => Promise<void>;
  onClose: () => void;
}

export const HistoryView: React.FC<Props> = ({ onRevert, onClose }) => {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingSha, setRevertingSha] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await (window as any).api.getHistory(50);
        setCommits(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Historique</h2>
          <button onClick={onClose}>✕</button>
        </div>

        {loading && <div className="loading">Chargement…</div>}

        {!loading && commits.length === 0 && <div>Pas encore d'historique.</div>}

        <ul className="history-list">
          {commits.map((c, idx) => (
            <li key={c.sha} className="history-item">
              <div className="history-main">
                <code className="sha">{c.sha.slice(0, 7)}</code>
                <span className="commit-msg">{c.message.split('\n')[0]}</span>
                <span className="commit-meta">
                  par {c.author} • {formatDate(c.date)}
                </span>
              </div>
              <div className="history-actions">
                <button
                  onClick={() => (window as any).api.openExternal(c.url)}
                  title="Voir sur GitHub"
                >
                  ↗
                </button>
                <button
                  className="primary"
                  disabled={idx === 0 || revertingSha !== null}
                  onClick={async () => {
                    if (
                      confirm(
                        `Revenir à la version ${c.sha.slice(0, 7)} ?\nUne PR de revert sera créée.`
                      )
                    ) {
                      setRevertingSha(c.sha);
                      try {
                        await onRevert(c.sha, c.sha.slice(0, 7));
                      } finally {
                        setRevertingSha(null);
                      }
                    }
                  }}
                >
                  {revertingSha === c.sha ? '…' : 'Revert'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
