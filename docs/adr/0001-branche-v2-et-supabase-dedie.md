# Branche v2 isolée de la production jusqu'au retour du voyage NZ

La v2 vit sur la branche `v2` et sera fusionnée dans `main` après le voyage en Nouvelle-Zélande. D'ici là, `main` ne reçoit que des correctifs de la v1, et la v2 utilise son propre projet Supabase gratuit (`vantravel-next`), parce que l'app de production sert sur le terrain et qu'une migration de schéma faite pour la v2 ne doit jamais l'atteindre. À la fusion, les migrations sont appliquées au projet de production (les comptes et le voyage NZ restent en place) et `vantravel-next` reste l'environnement de préversion.

## Considered Options

- Branches Supabase : facturées à l'heure de calcul (0,01344 $ en nov. 2026, crédits de l'offre non applicables), pensées pour la durée d'une PR. Écartées : coût non nul et durée de vie de plusieurs mois.
- Préversion sur `/vanTravelApp/next/` : écartée après coup, même origine que la v1 (stockage local partagé, service worker de la v1 qui capte `/next/`), et `deploy.yml` à modifier sur `main`.
- Préversion sur une autre origine (déploiement de branche chez Netlify, Vercel ou Cloudflare Pages) : écartée par la personne, qui préfère ne pas ajouter de service. Retenu : développement local seul, sur le port 43218 pour avoir une origine distincte de la v1 (127.0.0.1:43217).

## Consequences

L'offre gratuite de Supabase n'autorise que deux projets actifs : les deux sont pris. Chaque projet est mis en pause après une semaine d'inactivité ; `keepalive.yml` ne tourne que depuis `main`, gelé, donc `vantravel-next` se relance à la main depuis le tableau de bord. Pas de test hors ligne sur l'iPhone avant la fusion : le téléphone joint le PC en HTTP, sans service worker.
