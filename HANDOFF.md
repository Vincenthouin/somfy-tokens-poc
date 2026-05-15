# Somfy Tokens POC — Handoff Recap

> Document de reprise pour démarrer une nouvelle session Claude Code.
> Dernière mise à jour : commit `e84fb20`.

## 🔗 Liens essentiels

| | |
|---|---|
| **Repo GitHub** | https://github.com/Vincenthouin/somfy-tokens-poc |
| **Working dir local** | `/Users/vincentthouin/Desktop/SomfyDS-Loop_Plugin_Figma/somfy-tokens-poc` |
| **DMG le plus récent** | `editor/release/Somfy Tokens Editor-0.1.0-arm64.dmg` |
| **Fichier Figma de test** | https://www.figma.com/design/lMuZgH25cflbzU5WIFRETV/Tokens-Sync-POC |

## 🧱 Structure du repo

```
somfy-tokens-poc/
├── tokens/somfy-tokens.json          ← source of truth (W3C Design Tokens)
├── figma-plugin/                      ← plugin Figma "Somfy Token Sync"
│   ├── code.ts       (~1000 lignes — main thread)
│   ├── ui.html       (~1100 lignes — vanilla JS UI)
│   └── manifest.json
└── editor/                            ← app Electron + React
    ├── src/
    │   ├── shared/types.ts           ← Project, GitHubConfig, IPC channels
    │   ├── main/
    │   │   ├── index.ts              ← IPC handlers (Octokit + projet CRUD)
    │   │   ├── preload.ts            ← window.api bridge
    │   │   └── projectStore.ts       ← electron-store + migration legacy
    │   └── renderer/
    │       ├── App.tsx               ← router: picker | wizard | editor
    │       ├── EditorScreen.tsx      ← cœur de l'éditeur (~570 lignes)
    │       ├── api.d.ts              ← types window.api
    │       ├── styles.css            ← global (~1200+ lignes)
    │       ├── components/
    │       │   ├── ProjectPicker.tsx
    │       │   ├── ProjectWizard.tsx
    │       │   ├── ProjectSettingsModal.tsx
    │       │   ├── TokenTable.tsx
    │       │   ├── TokenValueCell.tsx
    │       │   ├── TokenInspector.tsx
    │       │   ├── SidebarTree.tsx
    │       │   ├── StatsStrip.tsx
    │       │   ├── FilterPills.tsx
    │       │   ├── AddTokenModal.tsx, AddGroupModal.tsx, PathPicker.tsx
    │       │   └── SaveModal.tsx, HistoryView.tsx, ValueEditor.tsx
    │       └── utils/
    │           ├── tokenTree.ts      ← manipulations + findBrokenAliases + resolveValue + tokenHasEmptyValue
    │           ├── diff.ts           ← computeDiff (before/after)
    │           ├── useTreeHistory.ts ← undo/redo hook
    │           └── mockApi.ts        ← stub browser-mode
```

## ✅ Features livrées

### Plugin Figma
- Sync GitHub → Variables (Light/Dark) + Text Styles + Effect Styles via PAT
- Auto-fetch SHA-based + banner "Update available"
- **cleanupOrphans** à l'apply : supprime Variables/Styles qui n'ont plus de token JSON correspondant
- **Drift detection** (modifications locales Figma non-syncs) avec ID-based tracking (résiste aux renames), badge RENAMED/DEL
- Polling 3s du drift (le `documentchange` Figma ne fire pas pour les variables)
- `normalizeColor` étend les hex courts (`#222` → `#222222`), strip alpha FF, hex alpha arrondi au % près
- Comparaisons mode-aware : un mode vide dans le JSON n'est pas comparé (pas de faux drift)
- Drift JSON-fallback : si Figma matche le JSON courant, pas de drift signalé même si le snapshot est obsolète
- Filters Color/Spacing/Radius/Shadow/Font, swatches, before/after inline, light/dark display

### Éditeur Electron
- **Multi-projets** : sources `github` ou `local`, persistés via `electron-store`
  - Wizard 3 étapes (nom → source → form ou import file)
  - CRUD : rename (modal custom), duplicate (→ toujours local), delete, settings
  - Migration legacy : ancienne `github_config` convertie en projet GitHub au 1er boot
  - **Migration Local → GitHub** : push initial du JSON + PR, refuse si fichier existe déjà
- **Vue tableau** : Name (éditable inline) / Value (inline pour types simples, multi-rows + drawer pour typo/shadow) / Resolved value (alias résolu) / Type / Description (éditable) / Actions
- **Inspector** : drawer overlay (380px à droite, slide-in, n'affecte pas le layout du tableau)
- **Sidebar tree** navigable + filter pills par `$type`
- **Add Token / Add Group** : PathPicker en cascade, dynamique (les layers ne sont plus hardcodés)
- **Undo / Redo** : ⌘Z / ⇧⌘Z + boutons header, ignorés dans les inputs (undo natif texte préservé)
- **Validation broken aliases** : badge ⚠ par token + stat card "Alias cassés"
- **Multi-select + bulk delete** : checkbox column, BulkActionsBar flottante, refs-aware
- **Valeurs vides tolérées** : badge ⚠ vide + stat card "Valeurs vides" (pas de blocage, juste un visuel)
- **Export JSON** dispo partout (file picker natif Electron + Blob download en browser)
- **Save** : 1 PR ou 1 save local groupant TOUTES les modifs (batching natif via tree in-memory)
- **Browser mode** (`npm run dev:vite`) avec mock API en localStorage pour test/capture Figma

## 🐛 Bugs récents résolus

- ✅ `prompt()` Electron disabled → modal custom
- ✅ Hex courts `#222` → drift faux car comparaison de strings non normalisées
- ✅ `dark: ""` (mode vide) → drift faux car comparaison forcée des deux modes
- ✅ Inspector pushait le layout → maintenant overlay absolu
- ✅ PathPicker : layers hardcodés affichés sur fichier vierge → maintenant dynamiques
- ✅ PathPicker : nouveau segment perdu dans le dropdown après typo → maintenant injecté comme option synthétique
- ✅ `cleanupOrphans` ne détectait pas les variables orphelines via snapshot → scan direct de la collection ajouté
- ✅ Notif toast bloquante → maintenant ferme uniquement au clic "Ouvrir la PR"

## 💡 Backlog / Idées non implémentées

### Priorité moyenne
- **Templates de démarrage** pour projets locaux (Material 3, Tailwind palette, Radix, etc.)
- **Raccourcis clavier additionnels** : ⌘S save, ⌘F focus search, ⌘K command palette
- **Détection auto du `$type`** quand on entre une valeur (`#hex` → color, `12px` → dimension)
- **Diff preview enrichi** dans le SaveModal (avant/après visuellement, pas juste textuel)
- **Light theme** pour l'éditeur (actuellement dark only)

### Priorité plus basse
- **Migration inverse GitHub → Local** (snapshot du JSON courant, déconnecte le source)
- **Drag-drop** pour déplacer des tokens entre groupes
- **Bulk move/duplicate** en plus du bulk delete
- **Search global** cross-projets dans le picker
- **Tab History** du plugin Figma avec commits récents du fichier tokens

### Sécurité / prod (POC → V2)
- **GitHub App + Cloudflare Worker** au lieu du PAT en clair dans clientStorage / electron-store
- **Code signing** macOS pour signer le DMG (~99 $/an Apple Developer)
- **Build Windows** (nécessite Windows ou CI GitHub Actions)
- **Icône custom** (`build/icon.icns` 1024×1024)

### Limitations connues à patcher si besoin
- Drift detection skip typography/shadow JSON-fallback (snapshot stocke le readback Figma, pas le JSON brut). Si le snapshot devient obsolète pour ces types, faux drift possible. Solution : faire un readback identique côté JSON (résoudre alias + transformer) pour comparer.
- Police `Somfy Sans ExtraBold` non installée → font weight 800 fallback Regular dans Figma. Soit fix les poids dans le JSON (`regular: 400`, `medium: 500`), soit installer la font.

## 🛠️ Commandes utiles

```bash
# Plugin Figma
cd /Users/vincentthouin/Desktop/SomfyDS-Loop_Plugin_Figma/somfy-tokens-poc/figma-plugin
npm run build        # compile code.ts → code.js
npm run watch        # auto-rebuild
# Reload dans Figma : Plugins → Development → reload

# Éditeur — mode dev
cd /Users/vincentthouin/Desktop/SomfyDS-Loop_Plugin_Figma/somfy-tokens-poc/editor
npm run dev          # Vite + Electron, hot reload
npm run dev:vite     # browser uniquement (http://localhost:5173, mock API)

# Éditeur — production
npm run build        # vite build + tsc main
npm run dist:mac     # DMG arm64 → editor/release/
```

## ⚠️ Points d'attention pour la prochaine session

1. **`prompt()` indisponible** dans Electron — toujours utiliser un modal custom
2. **`confirm()` fonctionne** dans Electron — pas besoin de remplacer
3. **Browser mode (mock)** : utilise `localStorage` (clés `mock_projects`, `mock_current_project_id`). Pour reset, `localStorage.clear()` dans la console Chrome.
4. **Cache plugin** : Figma cache `code.js` au start du plugin. Pour reloader, **vraiment fermer puis relancer** le plugin (clic croix de la fenêtre, pas juste minimisé).
5. **PAT** stocké en clair dans `electron-store` (`~/Library/Application Support/somfy-tokens-editor/config.json`). C'est un POC.

## 🧭 Pour démarrer la prochaine session Claude Code

Copie-colle simplement :

> Lis `HANDOFF.md` à la racine du repo `/Users/vincentthouin/Desktop/SomfyDS-Loop_Plugin_Figma/somfy-tokens-poc`, puis on enchaîne sur : **[ta prochaine demande]**.
