import React, { useState } from 'react';
import { GitHubConfig } from '../../shared/types';

interface Props {
  initial: GitHubConfig | null;
  onSave: (config: GitHubConfig) => Promise<void>;
}

export const ConfigScreen: React.FC<Props> = ({ initial, onSave }) => {
  const [pat, setPat] = useState(initial?.pat || '');
  const [owner, setOwner] = useState(initial?.owner || '');
  const [repo, setRepo] = useState(initial?.repo || '');
  const [branch, setBranch] = useState(initial?.branch || 'main');
  const [filePath, setFilePath] = useState(initial?.filePath || 'tokens/somfy-tokens.json');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ pat, owner, repo, branch, filePath });
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="config-screen">
      <h1>Tokens Editor</h1>
      <p className="muted">Configure l'accès au repo GitHub.</p>

      <label>
        Personal Access Token
        <input
          type="password"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          placeholder="ghp_... ou github_pat_..."
        />
        <small>
          Scope requis : <code>repo</code> (classic) ou <code>Contents + Pull requests: Read and write</code> (fine-grained).
          Stocké localement uniquement.
        </small>
      </label>

      <div className="row">
        <label>
          Owner
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="github-username-or-org"
          />
        </label>
        <label>
          Repo
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="repo-name"
          />
        </label>
      </div>

      <div className="row">
        <label>
          Branche de base
          <input value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <label>
          Chemin du fichier
          <input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="tokens/somfy-tokens.json"
          />
        </label>
      </div>

      {error && <div className="error">{error}</div>}

      <button
        className="primary"
        onClick={handleSave}
        disabled={saving || !pat || !owner || !repo}
      >
        {saving ? 'Sauvegarde…' : 'Enregistrer'}
      </button>
    </div>
  );
};
