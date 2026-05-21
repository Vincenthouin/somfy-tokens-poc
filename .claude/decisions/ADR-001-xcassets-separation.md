# ADR-001 — Séparation en deux xcassets distincts

## Statut
Accepté

## Contexte
Le repo `designsystem-ios` possède déjà un `Colors.xcassets` avec une organisation sémantique manuelle (Background/, Border/, Content/…). On doit intégrer les nouvelles couleurs issues de `somfy-tokens-poc` sans perturber l'existant.

## Décision
Créer un `ColorsIntegration.xcassets` distinct dans `designsystem-ios/Sources/DesignSystem/Resources/`, séparé de `Colors.xcassets`.

## Conséquences

**Avantages :**
- Zéro risque de collision ou d'écrasement des couleurs legacy
- Structure du nouveau xcassets pilotée par la hiérarchie JSON (générée automatiquement)
- Migration progressive possible : les deux palettes coexistent
- Rollback simple : supprimer `ColorsIntegration.xcassets` n'impacte pas l'existant

**Inconvénients :**
- Deux xcassets à maintenir pendant la période de transition
- À terme, les deux devront fusionner en un seul quand la migration est complète

## Alternatives envisagées
- **Fusionner dans Colors.xcassets** : rejeté car risque de collision et remapping manuel fastidieux
- **Remplacer Colors.xcassets** : rejeté car trop brutal, casse l'existant
