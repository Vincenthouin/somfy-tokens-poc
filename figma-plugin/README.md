# Somfy Token Sync — Figma Plugin

Bidirectional sync between a GitHub-hosted W3C Design Tokens JSON and Figma Variables / Styles.

## Features

**JSON → Figma (pull)**
- 🔑 Per-user GitHub auth (PAT, stored in Figma `clientStorage`)
- 🔍 Diff detection (Added / Modified / Removed) before applying
- ✅ One-click sync into a `Somfy Tokens` collection (Light + Dark modes)
- 🌗 Light/Dark modes auto-handled, dark placeholders flagged
- 🧹 Orphan cleanup at apply time
- 🔁 Auto-fetch on plugin boot so `Push` works immediately

**Figma → JSON (push)**
- 👀 Drift detection on every Figma change (variables/styles modified, renamed, deleted, OR added directly in Figma)
- 📤 One-click **Push to GitHub** → creates a PR with commit message + description (5 native REST calls, no backend)
- ↩ Per-token revert OR **Revert all** (re-applies the snapshot value, deletes added-from-Figma items)
- 🚦 Check / Apply are disabled while a drift is unresolved (no silent overwrite)
- 📦 ADDED items push the W3C node `{ $type, $value }` reconstructed from the Figma readback (color modes, typography fontWeight reverse-mapped, shadow px-suffixed)

**Pending merge flow**
- 🏷 Persistent "PR pending merge" banner with Refresh + Open PR buttons, survives plugin reloads via `clientStorage`
- 🔄 SHA poller auto-fetches when the remote SHA changes during pending — detects the merge without user action
- 🧠 Auto-clear of pending state when the fetched JSON matches the expected post-merge path set + variable values

## Supported token types

| W3C `$type`   | Figma target | Pull | Push |
|---------------|--------------|------|------|
| `color`       | Variable (COLOR, Light+Dark modes) | ✅ | ✅ |
| `dimension`   | Variable (FLOAT, px stripped) | ✅ | ✅ |
| `number`      | Variable (FLOAT) | ✅ | ✅ |
| `fontWeight`  | Variable (FLOAT) | ✅ | ✅ |
| `fontFamily`  | Variable (STRING) | ✅ | ✅ |
| `typography`  | Text Style (composite) | ✅ | ✅ (modify + add + delete; rename skipped — ambiguous reverse mapping) |
| `shadow`      | Effect Style (DROP_SHADOW) | ✅ | ✅ (modify + add + delete; rename skipped) |

## Install (local dev)

```bash
npm install
npm run build
```

Then in Figma Desktop:
1. Menu → Plugins → Development → Import plugin from manifest
2. Select `manifest.json` in this folder

> **Reload tip**: after `npm run build`, close the plugin window (X) and relaunch — minimizing or re-opening the tab doesn't reload `code.js`.

## Configure

1. Open the plugin → **Config** tab
2. Paste your GitHub PAT (fine-grained, Contents: Read/Write on the repo)
3. Set owner / repo / branch / file path
4. **Save config** + **Test connection**

## Usage

### Pull from GitHub → Figma
1. **Sync** tab → **Check** (or rely on the auto-fetch at boot)
2. Review the diffs (Added / Modified / Removed, filterable by category)
3. **Apply N** → tokens are written to the `Somfy Tokens` collection

### Push from Figma → GitHub
1. Modify / rename / delete / create Variables or Text/Effect Styles directly in Figma
2. Plugin shows them in the inline drift list (Check / Apply are disabled until resolved)
3. Either **Revert all** to discard, OR **↑ Push to GitHub**
4. Edit commit message + description → **Create PR**
5. Success modal shows the PR URL ("Open PR" link) → close
6. Persistent banner reminds you the PR is pending merge
7. Merge the PR on GitHub → next SHA poll (≤ 30s) or **Refresh** clears the banner

## Notes

- The plugin creates a single Figma collection named `Somfy Tokens` with two modes: `Light` and `Dark`.
- Variables are named after their JSON path (e.g. `primitives/loop/color/background/main`); `_base` segments collapse to `base` in Figma.
- Text/Effect Styles use the path-derived name (e.g. `Loop / Typography / Title Soft`).
- Dark placeholder values (`#95FF00`) are still applied — easy to spot and replace later.
- For typography, the snapshot stores the Figma readback (post-alias resolution) — pushed modifications override individual fields, leaving aliased fields untouched when unchanged.
