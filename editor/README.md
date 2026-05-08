# Tokens Editor

App desktop locale pour éditer les design tokens stockés sur GitHub.

## Stack

- **Electron** + **React** + **TypeScript**
- **Vite** pour le bundling renderer
- **Octokit** pour l'API GitHub
- **electron-store** pour la persistance locale du PAT

## Setup

```bash
cd editor
npm install
npm run dev
```

Au premier lancement, l'app demande :

- **Personal Access Token** (scope `repo` pour un classic token, ou `Contents + Pull requests: Read and write` pour un fine-grained, créé sur https://github.com/settings/tokens)
- Owner / Repo / Branche / Chemin du fichier JSON (défaut : `tokens/somfy-tokens.json`)

Le PAT est stocké localement dans `electron-store`. Pour la phase prod, basculer sur `keytar` (keychain OS).

## Workflow d'édition

1. L'app charge le JSON depuis la branche de base (ex: `main`).
2. Tu modifies des noms et/ou valeurs.
3. Une barre apparaît en bas dès qu'il y a des changements.
4. Clic sur **Sauvegarder les modifications** → modal de confirmation avec récap du diff + saisie du message.
5. À la confirmation, l'app crée une branche `edit/YYYY-MM-DDTHH-mm`, commit, et ouvre une PR vers `main`.

## Features

- Tabs catégories : **All / Color / Spacing / Radius / Shadow / Font**
- Color picker dual (Light + Dark) pour les tokens couleurs avec modes
- Picker d'aliases avec autocomplete (bouton 🔗) pour lier un token à un autre
- Renommage avec mise à jour automatique des références
- Compteur de références par token (`↩ N`)
- Historique : liste des commits, ouverture sur GitHub, **revert via PR**

## Build

```bash
npm run build
npm start
```

## Limitations connues (V1)

- Pas de création/suppression de tokens (édition pure)
- Pas de gestion de conflits si plusieurs PRs touchent le même fichier
- L'objet `$value` complexe (shadows, typography) s'édite en JSON brut
