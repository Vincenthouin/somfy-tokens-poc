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
Plugin Figma **bidirectionnel** entre le JSON GitHub et Figma :

**JSON → Figma** (pull) :
- Variables Figma (couleurs Light/Dark, dimensions, font weights/sizes/family)
- Text Styles (fontSize lié aux Variables)
- Effect Styles (shadows)
- Détection de diffs (Added/Modified/Removed), résolution d'aliases, nommage auto.

**Figma → JSON** (push) :
- Détection automatique des dérives locales : variables/styles modifiés, renommés, supprimés, ou ajoutés directement dans Figma.
- Création d'une PR GitHub en un clic (5 appels REST natifs, pas de backend), avec message + description + lien direct vers la PR.
- Auto-fetch au boot + auto-refresh post-merge via polling SHA.
- Bandeau persistant "PR pending merge" qui survit aux reloads et bloque Check/Apply tant que la PR n'est pas mergée (évite tout clobber de l'état local).

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
│  (édition UI)   │ ──PR──▶ │  tokens/*.json  │ ◀─PR/API▶ (sync Figma)    │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

Deux points d'entrée d'édition possibles, tous deux passent par une PR :

- **Via l'éditeur** : designer modifie via l'UI desktop → PR créée → merge → plugin Figma pull les changements.
- **Via Figma** : designer ajoute / modifie / supprime des Variables ou Styles directement dans Figma → le plugin détecte le drift → push vers une PR GitHub → merge → état Figma + JSON re-aligné automatiquement.

## Roadmap

- ✅ **Phase 1** : POC fonctionnel one-way (JSON → Figma) + éditeur desktop.
- ✅ **Phase 2** : Push bidirectionnel depuis Figma (modif / rename / delete / add) + UX drift/pending-merge.
- ⏳ **Phase 3** : GitHub App + Cloudflare Worker (sécu prod, plus de PAT côté client), couche `semantic` complète, publication plugin sur l'org Figma.

## Setup pour un nouveau contributeur

```bash
git clone https://github.com/<owner>/somfy-tokens-poc.git
cd somfy-tokens-poc
```

Puis suivre le README de chaque composant selon ce qu'on veut faire :
- **Modifier les tokens via UI** → `cd editor && npm install && npm run dev`
- **Tester le plugin Figma** → voir `figma-plugin/README.md`
- **Modifier le JSON à la main** → éditer `tokens/somfy-tokens.json` et créer une PR

## Sécurité — important

- Ne **jamais** committer un PAT GitHub dans le code ou des fichiers de config.
- Les PAT sont stockés en local : `clientStorage` (Figma) ou `electron-store` (editor).
- En Phase 3, on bascule sur GitHub App + Worker pour ne plus exposer de PAT côté client.
