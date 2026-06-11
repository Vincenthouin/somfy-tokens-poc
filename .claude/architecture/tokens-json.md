# Structure du JSON de tokens

## Format

W3C Design Tokens Community Group format.
Fichier : `tokens/somfy-tokens.json`

## Hiérarchie

```
{
  "primitives": { ... },   ← valeurs brutes (couleurs, espaces, radius, shadows, fonts)
  "semantic": { ... },     ← RÉSERVÉ — à peupler
  "composite": { ... },    ← typographies composites (fontFamily + weight + size + lineHeight)
  "component": { ... }     ← tokens spécifiques aux composants (ex: button)
}
```

## Structure des couleurs primitives

```
primitives.loop.color
├── layout
│   ├── main
│   └── neutral
├── background
│   ├── main
│   │   ├── _base       ← token de base du groupe
│   │   └── onbold      ← variante
│   ├── secondary
│   ├── alternative
│   │   ├── _base
│   │   └── onbold
│   ├── subtle
│   ├── brand
│   │   ├── primary (soft, bold)
│   │   ├── secondary (soft, bold)
│   │   └── tertiary (soft, bold)
│   ├── accent (soft, bold)
│   ├── success (soft, bold)
│   ├── warning (soft, bold)
│   └── error (soft, bold)
├── content
│   ├── primary (_base, onbold)
│   ├── secondary (_base, onbold)
│   ├── accent (_base, onsoft)
│   ├── success (_base, onsoft)
│   ├── warning (_base, onsoft)
│   ├── error (_base, onsoft)
│   └── brand (primary, primary-onsoft, secondary, secondary-onsoft)
└── border
    ├── main, bold, secondary, subtle, warning, success, error
    ├── accent (_base, onbold)
    └── brand (primary)
```

## Anatomie d'un token

```json
"main": {
  "$type": "color",
  "$value": {
    "light": "#FFFFFF",
    "dark": "#95FF00"
  },
  "$extensions": {
    "somfy.darkPlaceholder": true
  }
}
```

| Champ | Description |
|---|---|
| `$type` | Type W3C : `color`, `dimension`, `fontFamily`, `fontWeight`, `shadow`, `typography` |
| `$value` | Valeur du token. Peut être un objet `{ light, dark }` ou une string directe |
| `$extensions.somfy.darkPlaceholder` | `true` = la valeur dark est un placeholder `#95FF00` non finalisée |

## Conventions importantes

### Clé `_base`
Quand un groupe a une valeur principale ET des variantes, la valeur principale est stockée sous `_base` :
```json
"main": {
  "_base": { "$type": "color", "$value": { "light": "#FFFFFF" } },
  "onbold": { "$type": "color", "$value": { "light": "#00000080" } }
}
```
→ Dans le xcassets généré, `_base` est renommé en `base`.

### Dark placeholder
`#95FF00` (vert fluo) = couleur temporaire pour signaler qu'une valeur dark n'est pas encore définie.
Toujours accompagnée de `$extensions.somfy.darkPlaceholder: true`.

### Aliases
Les tokens peuvent référencer d'autres tokens :
```json
"$value": "{primitives.loop.font.weight.regular}"
```

### Valeurs vides
Certains tokens ont `"light": ""` (ex: états hover/pressed/disabled non définis).
→ Ces tokens sont ignorés à la génération.

## Autres primitives (hors couleurs)

| Clé | Type | Valeurs |
|---|---|---|
| `spaces` | dimension | 0, 4, 8, 12, 16, 20, 24, 32, 40, 56, 64, 80px |
| `radius` | dimension | 0, 4, 8, 12, 16, 24, 32, 64px |
| `shadow` | shadow | 100, 200, footer |
| `font.family` | fontFamily | Somfy Sans |
| `font.weight` | fontWeight | light(300), regular(400), medium(500) |
| `font.size` | dimension | 12, 14, 16, 19, 22, 36px |
| `font.lineHeight` | number | 1.2, 1.25, 1.35, 1.5 |
