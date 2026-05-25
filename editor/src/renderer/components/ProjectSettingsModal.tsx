import React, { useState } from 'react';
import { GitHubConfig, Project, TokenFile } from '../../shared/types';

interface Props {
  project: Project;
  currentTokens: TokenFile;
  onCancel: () => void;
  onSaved: (project: Project) => void;
  onMigrated: (project: Project, prUrl: string) => void;
}

export const ProjectSettingsModal: React.FC<Props> = ({
  project,
  currentTokens,
  onCancel,
  onSaved,
  onMigrated,
}) => {
  const [name, setName] = useState(project.name);

  // GitHub config (used both for editing a github project AND for migrating a local one)
  const initialGithub: GitHubConfig = project.github || {
    pat: '',
    owner: '',
    repo: '',
    branch: 'develop',
    filePath: 'tokens.json',
  };
  const [pat, setPat] = useState(initialGithub.pat);
  const [owner, setOwner] = useState(initialGithub.owner);
  const [repo, setRepo] = useState(initialGithub.repo);
  const [branch, setBranch] = useState(initialGithub.branch);
  const [filePath, setFilePath] = useState(initialGithub.filePath);

  const [showMigrate, setShowMigrate] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; fileExists: boolean; error?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const githubInput: GitHubConfig = { pat, owner, repo, branch, filePath };
  const githubFormFilled = !!(pat && owner && repo && branch && filePath);

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await window.api.testGithub(githubInput);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ ok: false, fileExists: false, error: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const update: any = { id: project.id };
      if (name.trim() && name.trim() !== project.name) update.name = name.trim();
      if (project.source === 'github') update.github = githubInput;
      const updated = await window.api.updateProject(update);
      onSaved(updated);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMigrate = async () => {
    if (!githubFormFilled) {
      setError('Tous les champs GitHub sont requis pour migrer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await window.api.migrateToGithub({
        projectId: project.id,
        github: githubInput,
        tokens: currentTokens,
      });
      onMigrated(res.project, res.url);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Paramètres du projet</h2>

        <div className="form-group">
          <label>Nom du projet</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Source</label>
          <div>
            <span className={`source-badge source-${project.source}`}>{project.source}</span>
            {project.source === 'local' && !showMigrate && (
              <button
                style={{ marginLeft: 12 }}
                onClick={() => setShowMigrate(true)}
              >
                Migrer vers GitHub →
              </button>
            )}
          </div>
        </div>

        {(project.source === 'github' || showMigrate) && (
          <>
            <h3 className="settings-section-title">
              {project.source === 'github' ? 'Configuration GitHub' : 'Cible de la migration'}
            </h3>
            <div className="form-group">
              <label>Personal Access Token</label>
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="ghp_xxx…"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Owner</label>
                <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Repo</label>
                <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Branche de base</label>
                <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Chemin du fichier</label>
                <input
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <button onClick={handleTest} disabled={!githubFormFilled || testing}>
                {testing ? 'Test…' : 'Tester la connexion'}
              </button>
              {testResult && (
                <div className={testResult.ok ? 'form-success' : 'form-error'} style={{ marginTop: 8 }}>
                  {testResult.ok
                    ? `✓ Connexion OK${testResult.fileExists ? ' — le fichier existe déjà sur cette branche.' : ' — le fichier n\'existe pas encore (parfait pour une migration).'}`
                    : `✕ ${testResult.error}`}
                </div>
              )}
            </div>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onCancel}>Annuler</button>
          {showMigrate ? (
            <button
              className="primary"
              disabled={!githubFormFilled || submitting}
              onClick={handleMigrate}
            >
              {submitting ? 'Migration…' : 'Migrer + créer la PR'}
            </button>
          ) : (
            <button
              className="primary"
              disabled={submitting}
              onClick={handleSave}
            >
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
