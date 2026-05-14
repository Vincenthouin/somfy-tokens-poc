import React, { useEffect, useState } from 'react';
import { ProjectSummary } from '../../shared/types';

interface Props {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

export const ProjectPicker: React.FC<Props> = ({ onOpen, onCreate }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [duplicating, setDuplicating] = useState<ProjectSummary | null>(null);
  const [duplicateInFlight, setDuplicateInFlight] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await window.api.listProjects();
      // Most recent first
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      setProjects(list);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!renaming) return;
    if (newName.trim() && newName.trim() !== renaming.name) {
      await window.api.updateProject({ id: renaming.id, name: newName.trim() });
      await refresh();
    }
    setRenaming(null);
  };

  const handleDelete = async (p: ProjectSummary) => {
    if (!confirm(`Supprimer le projet "${p.name}" ?\nCette action est définitive.`)) return;
    await window.api.deleteProject(p.id);
    void refresh();
  };

  const handleDuplicateSubmit = async (newName: string) => {
    if (!duplicating) return;
    setDuplicateInFlight(true);
    try {
      const tokens = await window.api.loadTokens(duplicating.id);
      const created = await window.api.createProject({
        name: newName.trim() || `${duplicating.name} (copie)`,
        source: 'local',
        localTokens: tokens,
      });
      setDuplicating(null);
      // Open the new (local) copy immediately so the user can start tweaking
      onOpen(created.id);
    } catch (e: any) {
      alert(`Duplication échouée : ${e.message || e}`);
    } finally {
      setDuplicateInFlight(false);
    }
  };

  return (
    <div className="picker-screen">
      <div className="picker-container">
        <header className="picker-header">
          <div>
            <h1>Tokens Editor</h1>
            <p className="muted">Sélectionne un projet ou crées-en un nouveau.</p>
          </div>
          <button className="primary" onClick={onCreate}>
            + Nouveau projet
          </button>
        </header>

        {loading ? (
          <div className="picker-loading">Chargement…</div>
        ) : projects.length === 0 ? (
          <div className="picker-empty">
            <p>Aucun projet pour le moment.</p>
            <button className="primary" onClick={onCreate}>
              Créer le premier projet
            </button>
          </div>
        ) : (
          <ul className="picker-list">
            {projects.map((p) => (
              <li key={p.id} className="picker-card">
                <button className="picker-card-main" onClick={() => onOpen(p.id)}>
                  <div className="picker-card-title">
                    <span>{p.name}</span>
                    <span className={`source-badge source-${p.source}`}>{p.source}</span>
                  </div>
                  {p.repoLabel && <div className="picker-card-meta">{p.repoLabel}</div>}
                  <div className="picker-card-date">
                    Modifié {formatRelative(p.updatedAt)}
                  </div>
                </button>
                <div className="picker-card-actions">
                  <button onClick={() => setRenaming(p)} title="Renommer">✎</button>
                  <button onClick={() => setDuplicating(p)} title="Dupliquer en projet local">⎘</button>
                  <button className="danger" onClick={() => handleDelete(p)} title="Supprimer">🗑</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {renaming && (
        <RenameModal
          initial={renaming.name}
          onCancel={() => setRenaming(null)}
          onSubmit={handleRenameSubmit}
        />
      )}
      {duplicating && (
        <DuplicateModal
          source={duplicating}
          submitting={duplicateInFlight}
          onCancel={() => setDuplicating(null)}
          onSubmit={handleDuplicateSubmit}
        />
      )}
    </div>
  );
};

const DuplicateModal: React.FC<{
  source: ProjectSummary;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}> = ({ source, submitting, onCancel, onSubmit }) => {
  const [value, setValue] = useState(`${source.name} (copie)`);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Dupliquer le projet</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          La copie sera créée en <span className="source-badge source-local">local</span>{' '}
          {source.source === 'github'
            ? '(un snapshot du fichier GitHub courant).'
            : '.'}
        </p>
        <div className="form-group">
          <label>Nom de la copie</label>
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !submitting) onSubmit(value);
              if (e.key === 'Escape') onCancel();
            }}
          />
        </div>
        <div className="modal-actions">
          <button onClick={onCancel} disabled={submitting}>
            Annuler
          </button>
          <button
            className="primary"
            disabled={!value.trim() || submitting}
            onClick={() => onSubmit(value)}
          >
            {submitting ? 'Duplication…' : 'Dupliquer'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RenameModal: React.FC<{
  initial: string;
  onCancel: () => void;
  onSubmit: (next: string) => void;
}> = ({ initial, onCancel, onSubmit }) => {
  const [value, setValue] = useState(initial);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Renommer le projet</h2>
        <div className="form-group">
          <label>Nouveau nom</label>
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(value);
              if (e.key === 'Escape') onCancel();
            }}
          />
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>Annuler</button>
          <button
            className="primary"
            disabled={!value.trim() || value.trim() === initial}
            onClick={() => onSubmit(value)}
          >
            Renommer
          </button>
        </div>
      </div>
    </div>
  );
};

function formatRelative(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `à l'instant`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(timestamp).toLocaleDateString();
}
