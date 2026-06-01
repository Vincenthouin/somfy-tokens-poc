# Somfy Tokens POC — Project memory

This file is auto-loaded by Claude Code at session start.
Keep it terse, source-of-truth, no historical narrative.

## What this repo is

Repo dédié aux **tokens** (W3C Design Tokens JSON). Le plugin Figma et
l'éditeur desktop ont été déplacés vers un repo séparé.

```
tokens-poc/
└── tokens/somfy-tokens.json   ← source of truth (W3C Design Tokens format)
```

GitHub: https://github.com/Vincenthouin/tokens-poc

Plugin Figma + éditeur desktop : https://github.com/Vincenthouin/Token-Plugin-Editor

## Branches & sync policy

- `main` = version stable des tokens.
- `develop` = preprod ; branche que le plugin/éditeur lisent et écrivent.
  Toute PR d'édition de tokens (via éditeur ou plugin) cible `develop`.
- **Never merge `develop → main`** sans revue manuelle. Les PRs auto vivent
  sur `develop`. Promotion vers `main` = action explicite et délibérée.

## Conventions

- **Language** : JSON / commits en anglais ; description tokens et commentaires
  parfois en français (l'utilisateur est français).
- **Commits** : titre impératif, ~70 chars max. Toujours terminer par le
  trailer `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- **Don't push to origin/main without explicit user instruction.**

## W3C Design Tokens shape

- Group = `{ "child": ... }` (no `$value`).
- Token = `{ "$type": "color", "$value": "...", "$description"?: "...", "$extensions"?: {...} }`.
- Alias values look like `"{primitives.loop.color.background.main}"`.
- For color with light/dark modes, `$value` is `{ "light": "#...", "dark": "#..." }`
  (NOT `$extensions.modes`).
- Empty value `""` is tolerated.

## Layers

- Historical layers : `primitives` / `semantic` / `composite` / `component`.
- Pas hardcodés — toute clé top-level non préfixée `$` est traitée comme une layer.
  L'utilisateur peut créer des layers custom.
