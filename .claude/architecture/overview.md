# Architecture générale

## Vue d'ensemble

```
tokens/somfy-tokens.json (GitHub — source de vérité)
        ↑ PR              ↑ PR              ↓ script
        |                  |                 |
   Editor              Figma Plugin    generate-xcassets.ts
 (Electron)           (Vanilla JS)          |
                                    ColorsIntegration.xcassets
                                            ↓ copié/synced
                                    designsystem-ios
                                    └── Resources/
                                        ├── Colors.xcassets (legacy)
                                        └── ColorsIntegration.xcassets (nouveau)
                                            ↓
                                    ColorPalette protocol
                                    ├── LegacyColorPalette
                                    └── LoopColorPalette
                                            ↓ @Environment
                                    Consommateurs SwiftUI/UIKit
```

## Les 3 composants du POC

### 1. Editor (Electron + React)
- Charge le JSON depuis GitHub via Octokit
- Permet d'éditer les tokens inline (color picker, texte, alias)
- Crée une PR GitHub à chaque sauvegarde
- Support multi-projets (GitHub + Local)
- Undo/Redo, historique des commits, revert via PR

### 2. Figma Plugin (Vanilla JS)
- **Pull** : synchronise le JSON vers des Variables/Styles Figma
- **Drift detection** : détecte les modifications faites directement dans Figma (polling 3s)
- **Push** : crée une PR GitHub avec les changements faits dans Figma
- Tracking par ID Figma (résiste aux renames)
- Support light/dark modes

### 3. Script de génération (Node.js/TypeScript)
- Lit `somfy-tokens.json`
- Extrait les tokens `primitives.loop.color.*`
- Génère `ColorsIntegration.xcassets` pour intégration iOS
- Voir [xcassets-generation.md](./xcassets-generation.md)

## Flux de travail typique

1. Designer modifie une couleur dans Figma
2. Plugin Figma détecte le drift → crée une PR sur `somfy-tokens.json`
3. PR mergée sur `main`
4. Développeur lance `npm run generate:xcassets`
5. `ColorsIntegration.xcassets` regénéré
6. Copié dans `designsystem-ios/Resources/`
7. La `LoopColorPalette` pointe automatiquement sur les nouvelles valeurs
