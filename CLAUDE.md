# Somfy Tokens POC — Project memory

This file is auto-loaded by Claude Code at session start.
Keep it terse, source-of-truth, no historical narrative.

## What this repo is

POC bidirectional sync between a W3C Design Tokens JSON and Figma, with a
desktop editor for the JSON. Three independent components share
`tokens/somfy-tokens.json`:

```
somfy-tokens-poc/
├── tokens/somfy-tokens.json   ← source of truth (W3C Design Tokens format)
├── figma-plugin/              ← Figma plugin "Somfy Token Sync"
│   ├── code.ts                ← main thread (~1000 lines, compiled to code.js)
│   ├── ui.html                ← UI thread (vanilla JS)
│   └── manifest.json
└── editor/                    ← Electron + React desktop app
    ├── src/main/              ← Electron main (Octokit, projectStore)
    └── src/renderer/          ← React UI (EditorScreen + components/)
```

GitHub: https://github.com/Vincenthouin/somfy-tokens-poc

## Quick commands

```bash
# Figma plugin (after editing code.ts, fully close the plugin window in
# Figma before relaunching — minimizing won't reload code.js)
cd figma-plugin && npm run build          # compile code.ts → code.js
cd figma-plugin && npm run watch          # auto-rebuild

# Editor (Electron + Vite, HMR for the renderer)
cd editor && npm run dev                  # dev mode with HMR (preferred for iteration)
cd editor && npm run build                # vite build + tsc main
cd editor && npm run dist:mac             # DMG arm64 → editor/release/

# Editor — browser-only mock (for screenshots / no Electron)
cd editor && npm run dev:vite             # localhost:5173, mock API in localStorage
```

When the user says "rebuild the DMG", run `npm run dist:mac` in `editor/`.
When the user says "tester en dev", they want `npm run dev` (no rebuild).

## Project conventions

- **Language**: code is English; UI strings and comments are mostly French
  (the user is French).
- **Imports**: relative paths, no path aliases.
- **State updates in editor**: every tree mutation goes through `cloneTree()` +
  `setTree()` so `useTreeHistory` captures a single undo entry per operation.
- **Commits**: imperative title, ~70 chars max. Body lists what changed at a
  feature level, not a file level. Always end with the
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
- **Don't push to origin/main without explicit user instruction.**

## Architecture invariants

### W3C Design Tokens shape
- Group = `{ "child": ... }` (no `$value`).
- Token = `{ "$type": "color", "$value": "...", "$description"?: "...", "$extensions"?: {...} }`.
- Alias values look like `"{primitives.loop.color.background.main}"`.
- For color with light/dark modes, `$value` is `{ "light": "#...", "dark": "#..." }`
  (NOT `$extensions.modes`). Both forms exist in the wild — only the `$value`
  shape is being actively used now.
- Empty value `""` is tolerated (surfaced via ⚠ but doesn't block save).

### Layers (top-level groups)
- Historical layers: `primitives` / `semantic` / `composite` / `component`.
  They are NOT hardcoded anymore — `Object.keys(tree).filter(isGroup)` walks
  everything that isn't a `$`-prefixed key. Users can create custom layers.

### Figma plugin <-> JSON mapping
- Variable name = path with `.` → `/` (e.g. `primitives.color.brand` →
  `primitives/color/brand`). The `_base` JSON segment maps to `base` in Figma.
- Text Style name = path-derived (slash-separated, drops the first segment).
  Example: `composite.loop.typography.title-soft` →
  `Loop / Typography / Title Soft`.
- Modes: collection has exactly two modes named `Light` and `Dark`.
- The plugin stores `pushPending` / `pendingPushUrl` / `expectedPostMergePaths`
  in `figma.clientStorage` to track an in-flight PR across reloads.

### Editor architecture
- `useTreeHistory` (hook): exposes `{ tree, setTree, resetTree, undo, redo,
  canUndo, canRedo }`. Every mutation deep-clones via `cloneTree()` then
  `setTree(next)`. Don't mutate the tree in place outside helper functions.
- `tokenTree.ts` (utils): all tree primitives. Anything that changes paths
  must go through `rewriteAliasPaths()` to keep aliases consistent (see
  `renameNode` and `moveNode`).
- `findReferencesUnder()` is the dependency check that gates a delete.
  Never allow a delete that would break aliases — show a modal instead.

## Gotchas / lessons learned

- **Figma plugin reload**: closing the tab or minimizing the window does NOT
  reload `code.js`. The user MUST close via the window cross then relaunch.
  Document this whenever a code.ts change won't show up.
- **Figma `getVariableByIdAsync`** can return a non-null Variable for an
  entity that's been removed from the collection. For "still alive" checks,
  iterate `collection.variableIds` instead.
- **fetch GitHub from the plugin**: the UI's `fetchTokens` already uses
  `cache: 'no-store'` + cache-buster query param to dodge stale browser
  responses. New write endpoints must do the same.
- **PAT storage** (POC-only): plugin uses `figma.clientStorage`, editor uses
  `electron-store` at `~/Library/Application Support/somfy-tokens-editor/
  config.json`. Phase 3 will move to a GitHub App + Cloudflare Worker.
- **Electron quirks**: `prompt()` doesn't exist — use a custom modal.
  `confirm()` works.
- **Mock browser mode** (`npm run dev:vite`): stores projects in
  `localStorage` under `mock_projects` / `mock_current_project_id`. Reset via
  `localStorage.clear()` in the Chrome console.

## Where to look for what

| Task | File |
|------|------|
| Tree primitives (rename, move, alias rewrite, deps) | `editor/src/renderer/utils/tokenTree.ts` |
| Sidebar tree (drag/drop, context menu, inline rename) | `editor/src/renderer/components/SidebarTree.tsx` |
| Value editor (alias picker, color modes, types) | `editor/src/renderer/components/ValueEditor.tsx` |
| Inline value cell in the table | `editor/src/renderer/components/TokenValueCell.tsx` |
| Right inspector panel | `editor/src/renderer/components/TokenInspector.tsx` |
| Editor entrypoint (state, handlers, modals) | `editor/src/renderer/EditorScreen.tsx` |
| GitHub PR creation (Octokit) | `editor/src/main/index.ts` (handler `IPC.CREATE_PR`) |
| Plugin: drift detection / apply / push | `figma-plugin/code.ts` |
| Plugin UI: drift list, push flow, banners | `figma-plugin/ui.html` |

## Backlog (not yet shipped)

- Templates de démarrage pour projets locaux (Material 3, Tailwind, Radix).
- Light theme pour l'éditeur (dark only).
- Drag-drop pour déplacer des tokens entre groupes (groupes OK déjà).
- Bulk move / duplicate.
- Search global cross-projets dans le picker.
- Plugin: rename de styles composites au push (typography/shadow renamed
  est skipped — reverse de styleNameFromPath ambigu).
- Plugin: support ADDED pour tokens (variables/styles créés dans Figma).
  → Phase 2 partiellement faite, vérifier ce qui reste.
- Phase 3 prod: GitHub App + Cloudflare Worker (sécu), code signing macOS
  (~99$/an), Windows build, icône custom.
