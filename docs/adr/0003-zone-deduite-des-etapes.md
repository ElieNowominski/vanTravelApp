# Pas de choix de pays : la zone, les fuseaux et les devises se déduisent des étapes

La création d'un voyage ne demande ni pays ni région. Les pays traversés, l'emprise de la carte et le fuseau horaire de chaque étape se calculent depuis les coordonnées des étapes, hors ligne. Un tour de Bretagne ou un GR ne se pense pas en pays, et un Interrail traverse des pays qu'on ne planifie pas. Le fuseau passe du voyage à l'étape parce qu'un voyage multi-pays en traverse plusieurs, et « aujourd'hui » se calcule dans celui de l'étape en cours.

## Consequences

Les préréglages de région (`src/data/regions/`) et la règle « région de `src/data/regions/` » de `CLAUDE.md` ne servent plus qu'à la migration de la v1 et aux sources propres à un pays (calques DOC pour la Nouvelle-Zélande).
