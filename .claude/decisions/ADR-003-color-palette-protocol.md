# ADR-003 — Protocol ColorPalette + injection via @Environment

## Statut
Planifié (à implémenter dans designsystem-ios)

## Contexte
Le `designsystem-ios` doit pouvoir utiliser soit l'ancienne palette (`Colors.xcassets`) soit la nouvelle (`ColorsIntegration.xcassets`), selon le contexte. À terme, seule la nouvelle palette subsistera.

## Décision
Introduire un protocol `ColorPalette` dans `designsystem-ios`, avec deux implémentations, injecté via `@Environment` SwiftUI.

```swift
protocol ColorPalette {
    var backgroundMain: Color { get }
    var borderSubtle: Color { get }
    // ... tous les tokens sémantiques
}

struct LegacyColorPalette: ColorPalette {
    var backgroundMain: Color { Color("Background/Main", bundle: .module) }
    // → pointe sur Colors.xcassets
}

struct LoopColorPalette: ColorPalette {
    var backgroundMain: Color { Color("loop/color/background/main/base", bundle: .module) }
    // → pointe sur ColorsIntegration.xcassets
}

extension EnvironmentValues {
    var colorPalette: any ColorPalette {
        get { self[ColorPaletteKey.self] }
        set { self[ColorPaletteKey.self] = newValue }
    }
}
```

Usage dans l'app consommatrice :
```swift
MyApp()
    .environment(\.colorPalette, LoopColorPalette())
```

## Conséquences

**Avantages :**
- Migration progressive : les composants migrent vers `@Environment(\.colorPalette)` au fur et à mesure
- Swap de palette sans recompilation (injection runtime)
- Test-friendly : mock de `ColorPalette` trivial

**Inconvénients :**
- Mapping manuel entre les tokens sémantiques du protocol et les deux xcassets
- `LegacyColorPalette` est du code temporaire à supprimer après migration

## Responsabilités
- Le protocol et les implémentations vivent dans `designsystem-ios`
- `somfy-tokens-poc` ne connaît pas ce protocol — il livre juste les xcassets
- Le wrapper est maîtrisé par le design system (qui connaît la cible iOS)
