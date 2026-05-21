# somfy-tokens-poc — Mémoire du projet

## Contexte

POC de gestion centralisée des design tokens Somfy au format W3C.
Source de vérité unique : `tokens/somfy-tokens.json` sur GitHub.

## Repos impliqués

| Repo | Rôle |
|---|---|
| `somfy-tokens-poc` (ce repo) | Source de vérité des tokens + outils d'édition |
| `designsystem-ios` | Librairie iOS qui consomme les tokens générés |

## Stack

| Composant | Stack |
|---|---|
| Tokens JSON | W3C Design Tokens format |
| Editor | Electron 31 + React 18 + TypeScript + Vite + Octokit |
| Figma Plugin | Vanilla JS + GitHub REST API |
| Script génération | Node.js + TypeScript + tsx |
| Tests | Vitest |

## Structure du repo

```
somfy-tokens-poc/
├── tokens/
│   ├── somfy-tokens.json          ← source de vérité
│   ├── generate-xcassets.ts       ← script de génération xcassets
│   ├── generate-xcassets.test.ts  ← tests unitaires (Vitest)
│   ├── package.json
│   └── package-lock.json
├── editor/                        ← app Electron pour éditer les tokens
├── figma-plugin/                  ← plugin Figma pour sync bidirectionnelle
└── .claude/                       ← mémoire du projet (ce dossier)
```

## Commandes utiles

```sh
# Générer ColorsIntegration.xcassets depuis somfy-tokens.json
cd tokens && npm run generate:xcassets

# Lancer les tests unitaires
cd tokens && npm test

# Lancer les tests en mode watch
cd tokens && npm run test:watch
```

## Index de la documentation

- [Architecture générale](./architecture/overview.md)
- [Structure du JSON de tokens](./architecture/tokens-json.md)
- [Génération xcassets](./architecture/xcassets-generation.md)
- [Décisions d'architecture](./decisions/)
- [Workflow de génération](./workflows/generate-xcassets.md)
- [Roadmap](./roadmap.md)
