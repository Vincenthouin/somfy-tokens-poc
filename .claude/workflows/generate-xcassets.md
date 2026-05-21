# Workflow — Générer ColorsIntegration.xcassets

## Quand régénérer ?

- Après chaque modification de `tokens/somfy-tokens.json` (via editor ou figma plugin mergé)
- Avant de mettre à jour `designsystem-ios` avec de nouvelles couleurs

## Étapes

### 1. S'assurer que le JSON est à jour

```sh
cd /path/to/somfy-tokens-poc
git pull origin main
```

### 2. Lancer le script de génération

```sh
cd tokens
npm run generate:xcassets
```

Output attendu :
```
Generated 49 colorsets (6 with dark variant) → .../ColorsIntegration.xcassets
```

### 3. Vérifier la structure générée (optionnel)

```sh
find tokens/ColorsIntegration.xcassets -name "*.json" | head -20
```

### 4. Copier le xcassets dans designsystem-ios

```sh
cp -R tokens/ColorsIntegration.xcassets \
  /path/to/designsystem-ios/Sources/DesignSystem/Resources/
```

### 5. Committer dans designsystem-ios

```sh
cd /path/to/designsystem-ios
git add Sources/DesignSystem/Resources/ColorsIntegration.xcassets
git commit -m "chore: update ColorsIntegration.xcassets from somfy-tokens v<sha>"
```

## Lancer les tests

Avant de livrer, vérifier que les tests passent :

```sh
cd tokens
npm test
```

## En cas d'erreur

| Erreur | Cause | Solution |
|---|---|---|
| `No primitives.loop.color found` | JSON mal formé ou chemin incorrect | Vérifier `somfy-tokens.json` |
| `command not found: tsx` | Dépendances non installées | `npm install` dans `tokens/` |
| Colorset vide / manquant | Token avec `"light": ""` | Normal — ces tokens sont ignorés volontairement |
