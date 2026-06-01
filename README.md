# Somfy Tokens — POC

Source unique de vérité pour les design tokens Somfy, au format
[W3C Design Tokens](https://design-tokens.github.io/community-group/format/).

```
tokens-poc/
└── tokens/somfy-tokens.json   ← source de vérité
```

## Branches

- `main` — version stable des tokens.
- `develop` — préprod ; branche que l'éditeur et le plugin Figma lisent / écrivent.
  Les PR d'édition des tokens (depuis l'éditeur ou le plugin) ciblent `develop`.

## Outils (repos séparés)

L'éditeur desktop et le plugin Figma vivent désormais dans un repo dédié :

- **Plugin Figma + Éditeur desktop** → https://github.com/Vincenthouin/Token-Plugin-Editor

Les deux outils consomment et produisent des PRs sur ce repo (`tokens-poc`).

## Format

Voir [`tokens/somfy-tokens.json`](./tokens/somfy-tokens.json).

- Group = `{ "child": ... }` (pas de `$value`).
- Token = `{ "$type": "color", "$value": "...", "$description"?: "...", "$extensions"?: {...} }`.
- Alias = `"{primitives.loop.color.background.main}"`.
- Couleurs Light/Dark : `$value` = `{ "light": "#...", "dark": "#..." }`.

## Édition

- **Via UI** : ouvrir l'éditeur (cf. repo `Token-Plugin-Editor`) → modifs → PR auto sur `develop`.
- **Via Figma** : modifier Variables/Styles dans Figma → plugin détecte le drift → PR sur `develop`.
- **À la main** : éditer `tokens/somfy-tokens.json` et créer une PR.
