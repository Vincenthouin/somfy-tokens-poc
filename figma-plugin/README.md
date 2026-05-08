# Somfy Token Sync — Figma Plugin

POC plugin that syncs design tokens from a GitHub repo (W3C Design Tokens format) into Figma Variables.

## Features (V1)

- 🔑 Per-user GitHub auth (PAT, stored in Figma `clientStorage`)
- 🔍 Diff detection (added / modified / removed)
- ✅ One-click sync into Figma Variables
- 🌗 Light/Dark modes auto-handled
- 🚧 Dark placeholder counter (tokens flagged with `somfy.darkPlaceholder: true`)

## Supported token types

| W3C `$type`   | Figma Variable |
|---------------|----------------|
| `color`       | COLOR (Light + Dark modes) |
| `dimension`   | FLOAT (px stripped) |
| `number`      | FLOAT |
| `fontWeight`  | FLOAT |
| `fontFamily`  | STRING |
| `typography`  | *Skipped (composite — V2)* |
| `shadow`      | *Skipped (composite — V2)* |

## Install (local dev)

```bash
npm install
npm run build
```

Then in Figma Desktop:
1. Menu → Plugins → Development → Import plugin from manifest
2. Select `manifest.json` in this folder

## Configure

1. Open the plugin → **Config** tab
2. Paste your GitHub PAT
3. Set owner / repo / branch / file path
4. **Save config** + **Test connection**

## Use

1. **Sync** tab → **Check for updates**
2. Review the diffs
3. **Apply all** → tokens are written to a `Somfy Tokens` collection in your Figma file

## Notes

- The plugin creates a single Figma collection named `Somfy Tokens` with two modes: `Light` and `Dark`
- Variables are named after their JSON path (e.g. `primitives.loop.color.background.main`)
- Dark placeholder values (`#95FF00`) are still applied — easy to spot and replace later
