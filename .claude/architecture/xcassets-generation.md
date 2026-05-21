# Génération xcassets

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `tokens/generate-xcassets.ts` | Script de génération |
| `tokens/generate-xcassets.test.ts` | Tests unitaires (Vitest, 18 tests) |
| `tokens/somfy-tokens.json` | Source de vérité |
| `tokens/ColorsIntegration.xcassets` | Output généré (gitignored) |

## Règles de génération

### Périmètre
- Seuls les tokens `primitives.loop.color.*` sont traités
- `$type: "color"` uniquement (les dimensions, shadows, fonts sont ignorés)

### Gestion du dark mode
- Si `$extensions.somfy.darkPlaceholder: true` → colorset **light-only**
- Si pas de darkPlaceholder et valeur dark définie → colorset **light + dark**
- Si `$value.light === ""` → token **ignoré** (valeur non définie)

### Nommage
- La clé `_base` est renommée en `base` dans le chemin du colorset
- La hiérarchie JSON est préservée dans la structure des dossiers

### Structure xcassets
- Chaque dossier intermédiaire reçoit un `Contents.json` avec `"provides-namespace": true`
  (requis par Xcode pour les chemins `Color("loop/color/background/main/base")`)
- Le `Contents.json` racine contient uniquement les metadata

## Format d'un colorset

### Light-only
```json
{
  "colors": [
    {
      "idiom": "universal",
      "color": {
        "color-space": "srgb",
        "components": { "red": "1.000", "green": "1.000", "blue": "1.000", "alpha": "1.000" }
      }
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

### Light + dark
```json
{
  "colors": [
    {
      "idiom": "universal",
      "color": { "color-space": "srgb", "components": { ... } }
    },
    {
      "idiom": "universal",
      "appearances": [{ "appearance": "luminosity", "value": "dark" }],
      "color": { "color-space": "srgb", "components": { ... } }
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

## Conversion hex → RGBA

| Format hex | Exemple | Traitement |
|---|---|---|
| 3 chiffres | `#FFF` | Expansé en `#FFFFFF` |
| 6 chiffres | `#FFFFFF` | Alpha = FF (1.000) ajouté |
| 8 chiffres | `#00000080` | Alpha = 0x80/255 = 0.502 |

Chaque composante est arrondie à 3 décimales.

## Fonctions exportées (testables)

| Fonction | Rôle |
|---|---|
| `hexToComponents(hex)` | Convertit un hex en composantes RGBA `{ red, green, blue, alpha }` |
| `generateColorsetContents(light, dark?)` | Génère le contenu d'un `Contents.json` |
| `flattenColorTokens(obj, pathParts)` | Aplatit l'arbre de tokens en liste de `FlatToken` |
| `writeColorset(outputDir, token)` | Écrit un `.colorset/Contents.json` sur le disque |

## Output actuel

49 colorsets générés, dont 6 avec une vraie variante dark.
