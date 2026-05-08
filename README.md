# Somfy Tokens — POC

Source unique de vérité pour les design tokens, avec écosystème de synchronisation Figma ↔ Code.

## Architecture

```
somfy-tokens-poc/
├── tokens/              ← Fichier JSON W3C Design Tokens (source de vérité)
├── figma-plugin/        ← Plugin Figma "Somfy Token Sync"
└── editor/              ← App desktop pour éditer les tokens via UI
```

Trois composants indépendants, qui partagent le même fichier `tokens/somfy-tokens.json`.

## Composants

### 📄 `tokens/`
Le fichier `somfy-tokens.json` au format W3C Design Tokens.
Structure 4 couches : `primitives` → `semantic` → `composite` → `component`.

### 🎨 `figma-plugin/`
Plugin Figma qui lit le JSON depuis GitHub et crée :
- Variables Figma (couleurs Light/Dark, dimensions, font weights/sizes/family)
- Text Styles (fontSize lié aux Variables)
- Effect Styles (shadows)

Détection de diffs (Added/Modified/Removed), résolution d'aliases, convention de nommage automatique.

→ [README détaillé](./figma-plugin/README.md)

### 💻 `editor/`
App desktop (Electron + React) pour éditer le JSON via une UI graphique :
- Couleurs avec color picker dual Light/Dark
- Filtrage par catégorie (Color / Spacing / Radius / Shadow / Font)
- Renommage avec mise à jour auto des références
- Picker d'aliases avec autocomplete
- Création automatique de PR à chaque sauvegarde
- Historique + rollback via PR de revert

→ [README détaillé](./editor/README.md)

## Workflow type

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  editor/        │         │  GitHub         │         │  figma-plugin/  │
│  (édition UI)   │ ──PR──▶ │  tokens/*.json  │ ◀──API─ │  (sync Figma)   │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

1. **Designer** ouvre l'`editor`, modifie des tokens, sauvegarde → PR créée sur GitHub
2. **PR mergée** sur `main`
3. **Designer** ouvre Figma, lance le plugin → tokens synchronisés dans Figma

## Setup pour un nouveau contributeur

```bash
git clone https://github.com/<owner>/somfy-tokens-poc.git
cd somfy-tokens-poc
```

Puis suivre le README de chaque composant selon ce qu'on veut faire :
- **Modifier les tokens via UI** → `cd editor && npm install && npm run dev`
- **Tester le plugin Figma** → voir `figma-plugin/README.md`
- **Modifier le JSON à la main** → éditer `tokens/somfy-tokens.json` et créer une PR

## Roadmap

- ✅ **Phase 1 (actuelle)** : POC fonctionnel, test solo / petit groupe
- ⏳ **Phase 2** : GitHub App + Cloudflare Worker (sécu prod), versioning avancé, beta avec 2-3 designers
- ⏳ **Phase 3** : Publication plugin sur org Figma, onboarding équipe, couche `semantic` complète

## Sécurité — important

- Ne **jamais** committer un PAT GitHub dans le code ou des fichiers de config
- Les PAT sont stockés en local : `clientStorage` (Figma) ou `electron-store` (editor)
- Pour la phase 2, on bascule sur GitHub App + Worker pour ne plus exposer de PAT côté client
