import React from 'react';

interface RefEntry {
  referenced: string;
  referencedBy: string[];
}

interface Props {
  targetPath: string;
  refs: RefEntry[];
  onJumpToToken: (fullName: string) => void;
  onClose: () => void;
}

/**
 * Shown when a delete is blocked by external alias references. Lists the
 * referencing tokens with click-to-navigate. No "Force delete" button —
 * the user must remove the references first to avoid silent breakage.
 */
export const DeleteWithRefsModal: React.FC<Props> = ({ targetPath, refs, onJumpToToken, onClose }) => {
  const totalRefs = refs.reduce((sum, r) => sum + r.referencedBy.length, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Cannot delete <code>{targetPath}</code></h2>
        <p style={{ marginTop: 0 }}>
          {totalRefs} reference{totalRefs > 1 ? 's' : ''} point to token{refs.length > 1 ? 's' : ''} inside
          this {targetPath.includes('.') ? 'group' : 'layer'}. Remove the reference{totalRefs > 1 ? 's' : ''} first.
        </p>

        <div className="refs-list">
          {refs.map((r) => (
            <div key={r.referenced} className="refs-group">
              <div className="refs-target">
                <code>{r.referenced}</code>
                <span className="refs-arrow">←</span>
                <span className="refs-count">
                  {r.referencedBy.length} reference{r.referencedBy.length > 1 ? 's' : ''}
                </span>
              </div>
              <ul className="refs-callers">
                {r.referencedBy.map((caller) => (
                  <li key={caller}>
                    <button
                      className="refs-jump-btn"
                      onClick={() => {
                        onJumpToToken(caller);
                        onClose();
                      }}
                    >
                      <code>{caller}</code>
                      <span className="refs-jump-icon">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
