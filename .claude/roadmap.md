# Roadmap

## ✅ Fait

### somfy-tokens-poc
- Script `generate-xcassets.ts` — génère `ColorsIntegration.xcassets` depuis `somfy-tokens.json`
  - Primitives `loop.color.*` uniquement
  - Light-only si `darkPlaceholder: true`
  - `_base` renommé en `base`
  - Dossiers intermédiaires avec `provides-namespace: true`
  - Tokens à valeur vide ignorés
- Tests unitaires Vitest — 18 tests couvrant `hexToComponents`, `generateColorsetContents`, `flattenColorTokens`
- `ColorsIntegration.xcassets` gitignored (artefact généré)
- PR #39 ouverte en draft sur `feature/add-xcassets-generator`
- Documentation `.claude/` (architecture, ADRs, workflows)

---

## 🔜 En cours

### designsystem-ios
- [ ] Ajouter `ColorsIntegration.xcassets` dans `Resources/`
- [ ] Créer `ColorsIntegration+DS.swift` — hiérarchie `Color.Loop.*` / `UIColor.Loop.*` typée
- [ ] Protocol `ColorPalette` avec tous les tokens sémantiques
- [ ] `LegacyColorPalette` — mappe vers `Colors.xcassets`
- [ ] `LoopColorPalette` — mappe vers `ColorsIntegration.xcassets`
- [ ] `EnvironmentKey` `\.colorPalette` pour l'injection SwiftUI

---

## 📋 À venir

### somfy-tokens-poc
- [ ] Étendre le script aux niveaux `semantic`, `composite`, `component` quand définis
- [ ] CI/CD : régénérer automatiquement `ColorsIntegration.xcassets` à chaque merge sur `main`
- [ ] Automatiser la copie vers `designsystem-ios` (script ou GitHub Action)

### designsystem-ios
- [ ] Migrer les composants existants vers `@Environment(\.colorPalette)`
- [ ] Supprimer `LegacyColorPalette` une fois la migration complète
- [ ] Fusionner `ColorsIntegration.xcassets` dans `Colors.xcassets` (fin de transition)
- [ ] Supprimer l'ancien `Colors.xcassets` et `SomfyColors.swift`
