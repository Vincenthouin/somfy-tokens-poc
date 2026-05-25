import React, { useState } from 'react';
import { GitHubConfig, Project, ProjectSource, TokenFile } from '../../shared/types';

interface Props {
  onCancel: () => void;
  onCreated: (project: Project) => void;
}

type Step = 'name' | 'source' | 'github' | 'import-ready';

type SourceChoice = 'github' | 'local-empty' | 'local-import';

export const ProjectWizard: React.FC<Props> = ({ onCancel, onCreated }) => {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [sourceChoice, setSourceChoice] = useState<SourceChoice | null>(null);

  // GitHub form
  const [pat, setPat] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('develop');
  const [filePath, setFilePath] = useState('tokens/somfy-tokens.json');

  // Import state
  const [importedTokens, setImportedTokens] = useState<TokenFile | null>(null);
  const [importedFile, setImportedFile] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectSource = (choice: SourceChoice) => {
    setSourceChoice(choice);
    if (choice === 'github') setStep('github');
    else if (choice === 'local-empty') void create('local', undefined, {});
    else if (choice === 'local-import') void handleImport();
  };

  const handleImport = async () => {
    const res = await window.api.importJson();
    if (res.canceled || !res.tokens) {
      setSourceChoice(null);
      return;
    }
    setImportedTokens(res.tokens);
    setImportedFile(res.filePath || '');
    setStep('import-ready');
  };

  const create = async (
    source: ProjectSource,
    github?: GitHubConfig,
    localTokens?: TokenFile
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const project = await window.api.createProject({
        name: name.trim(),
        source,
        github,
        localTokens,
      });
      onCreated(project);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitGithub = () => {
    if (!pat || !owner || !repo || !branch || !filePath) {
      setError('Tous les champs sont requis.');
      return;
    }
    void create('github', { pat, owner, repo, branch, filePath });
  };

  const handleConfirmImport = () => {
    if (!importedTokens) return;
    void create('local', undefined, importedTokens);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Nouveau projet</h2>

        {step === 'name' && (
          <>
            <div className="form-group">
              <label>Nom du projet</label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Somfy Tokens V2"
              />
            </div>
            <div className="modal-actions">
              <button onClick={onCancel}>Annuler</button>
              <button
                className="primary"
                disabled={!name.trim()}
                onClick={() => setStep('source')}
              >
                Suivant →
              </button>
            </div>
          </>
        )}

        {step === 'source' && (
          <>
            <p className="muted">Choisis comment ce projet est initialisé.</p>
            <div className="source-choice-grid">
              <button className="source-choice" onClick={() => handleSelectSource('github')}>
                <div className="source-choice-title">GitHub</div>
                <div className="source-choice-desc">
                  Le JSON est hébergé dans un repo. Sauvegarder = créer une PR.
                </div>
              </button>
              <button
                className="source-choice"
                onClick={() => handleSelectSource('local-empty')}
              >
                <div className="source-choice-title">Local — vide</div>
                <div className="source-choice-desc">
                  Démarre avec un fichier vide. Construis ton arborescence dans l'éditeur.
                  Exportable en JSON.
                </div>
              </button>
              <button
                className="source-choice"
                onClick={() => handleSelectSource('local-import')}
              >
                <div className="source-choice-title">Local — importer un JSON</div>
                <div className="source-choice-desc">
                  Démarre depuis un fichier JSON existant. Sauvegardes locales,
                  réexportable.
                </div>
              </button>
            </div>
            <div className="modal-actions">
              <button onClick={() => setStep('name')}>← Retour</button>
            </div>
          </>
        )}

        {step === 'github' && (
          <>
            <div className="form-group">
              <label>Personal Access Token</label>
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="ghp_xxx…"
              />
              <small className="muted">
                Scope requis : <code>repo</code> (classic) ou <code>Contents</code> +{' '}
                <code>Pull requests: Read and write</code> (fine-grained).
              </small>
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
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button onClick={() => setStep('source')}>← Retour</button>
              <button className="primary" disabled={submitting} onClick={handleSubmitGithub}>
                {submitting ? 'Création…' : 'Créer'}
              </button>
            </div>
          </>
        )}

        {step === 'import-ready' && (
          <>
            <p>Fichier importé :</p>
            <code className="import-file-path">{importedFile}</code>
            <p className="muted">
              {countTokens(importedTokens)} token(s) détecté(s). Tu pourras éditer ce
              projet localement et le réexporter à tout moment.
            </p>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button onClick={() => setStep('source')}>← Retour</button>
              <button className="primary" disabled={submitting} onClick={handleConfirmImport}>
                {submitting ? 'Création…' : 'Créer le projet'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function countTokens(tree: TokenFile | null): number {
  if (!tree) return 0;
  let n = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if ('$value' in node) {
      n++;
      return;
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(tree);
  return n;
}
