# ADR-002 — ColorsIntegration.xcassets gitignored

## Statut
Accepté

## Contexte
Le script `generate-xcassets.ts` produit `ColorsIntegration.xcassets`. Se pose la question de le committer ou non dans `somfy-tokens-poc`.

## Décision
`ColorsIntegration.xcassets` est ajouté au `.gitignore`. Il est traité comme un artefact généré, non versionné dans ce repo.

## Conséquences

**Avantages :**
- Les PRs sur `somfy-tokens-poc` ne montrent que le vrai code (script, tests, JSON)
- Pas de diff xcassets bruyant à chaque modification de token
- Régénération toujours possible depuis le JSON source

**Inconvénients :**
- Le xcassets doit être régénéré manuellement après chaque modification des tokens
- À terme : automatiser via CI/CD (voir roadmap)

## Workflow attendu
1. Modifier `somfy-tokens.json` (via editor ou figma plugin)
2. Lancer `cd tokens && npm run generate:xcassets`
3. Copier `ColorsIntegration.xcassets` dans `designsystem-ios/Sources/DesignSystem/Resources/`
4. Committer dans `designsystem-ios`
