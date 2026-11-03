# Cadrage de la v2 (2 nov. 2026)

Trace de la séance de questions qui a lancé la v2, pour le retour d'expérience : chaque question posée par l'assistant, sa recommandation, la réponse de la personne et ce qu'elle a changé. Les décisions structurantes sont reprises dans `docs/adr/`, le travail dans `docs/PLAN-v2.md`.

## Point de départ

La v1 marche pour le voyage prévu en Nouvelle-Zélande, à deux, en van. La personne veut une version « plus complète » sur une branche : choix du pays (ou des pays), du mode de déplacement (van, voiture, vélo, marche, Interrail) et fonctionnalités associées. Deux questions d'entrée : à quoi servirait une clé API Google, et comment la limiter par utilisateur ; faut-il quitter GitHub Pages pour des raisons de sécurité.

Réponses de l'assistant avant la séance :

- Une clé Google dans le front ne se limite pas par utilisateur : les quotas portent sur la clé entière, et la restriction par référent HTTP se contourne hors navigateur. Limiter par compte demande un intermédiaire serveur ; une Edge Function Supabase suffit (clé en secret, session vérifiée, compteur par compte). GitHub Pages ne sert que des fichiers statiques et n'a rien à voir avec la sécurité des clés : pas besoin de le quitter.
- Les conditions de Google Places ne permettent de conserver que le `place_id` sans limite et les coordonnées 30 jours : incompatible avec un itinéraire stocké et consultable hors ligne.

## Les questions, tour par tour

### Tour 1 : les racines

- **Q1. Pour qui ?** Recommandé : vous deux et des proches invités, sans inscription ouverte. Réponse : oui au début, inscription ouverte à terme. Effet : préparer l'ouverture sans la faire (Q6).
- **Q2. La v2 part-elle d'un vrai prochain voyage ?** Recommandé : un voyage pilote, généraliser quand un deuxième voyage réel le demande. Réponse : le voyage NZ reste le voyage d'épreuve, mais l'app doit à terme servir tout type de voyage (road trip, trek, Interrail). Effet : modèle générique (Q8), ordre des types (Q9), et un voyage fictif pour juger (Q24), faute de voyage réel.
- **Q3. Même dépôt ?** Recommandé : branche longue fusionnée dans `main`. Réponse : oui, fusion après le voyage NZ.
- **Q4. `main` gelé pendant le voyage ?** Recommandé : correctifs v1 seulement, aucune migration sur la production. Réponse : oui.
- **Q5. Hors ligne pour tous les modes ?** Recommandé : oui, seuls les enrichissements peuvent exiger du réseau. Réponse : oui.

### Tour 2 : le périmètre

- **Q6. Préparer l'ouverture au public ?** Recommandé : rôles par voyage, plafonds par compte et cloisonnement dès la v2 ; CGU, RGPD, nom de domaine plus tard. Réponse : oui.
- **Q7. Coût mensuel ?** Recommandé : 0 € tant que l'app reste privée. Réponse : oui, entièrement gratuit, avec un blocage propre quand un quota gratuit est atteint.
- **Q8. Un seul modèle « jours, étapes, tronçons » ?** Recommandé : oui, mode et tracé portés par le tronçon. Réponse : oui.
- **Q9. Ordre des types de voyage ?** Recommandé : road trip multi-pays, puis Interrail en saisie manuelle, puis trek (les cartes hors ligne en montagne demandent des tuiles auto-hébergées). Réponse : oui, la priorité de la v2 est le road trip multi-pays.
- **Q10. Choisir les pays à la création ?** Recommandé : non, les pays se déduisent des étapes. Réponse : d'accord ; précision demandée sur ce que demande la création (traitée en Q12).
- **Q11. Projet Supabase et préversion dédiés ?** Recommandé : deuxième projet Supabase, préversion sur `/vanTravelApp/next/`. Réponse : d'accord, en signalant que Supabase propose des branches. Vérification : les branches Supabase sont facturées à l'heure (0,01344 $, crédits non applicables) et pensées pour la durée d'une PR ; un deuxième projet gratuit convient (deux projets actifs au plus, pause après une semaine d'inactivité). **Remis en cause après la séance** : voir « Ce que la séance n'avait pas vu ».

### Tour 3 : le fonctionnement

- **Q12. Écran de création ?** Recommandé : nom, dates, départ, arrivée (égale au départ par défaut), mode et véhicule. Réponse : oui pour l'instant.
- **Q13. Profils de véhicule ?** Recommandé : préréglages commités copiés dans le voyage ; garage par compte plus tard. Réponse : oui, avec des préréglages standard.
- **Q14. Points d'intérêt ?** Recommandé : OSM chargé selon la zone affichée, mis en cache le long du tracé au figeage, calques DOC réservés à la NZ. Question de la personne : « c'est pas là que la clé Google serait utile ? ». Traité en Q18.
- **Q15. Routage ?** Recommandé : OSRM derrière une interface interchangeable. Réponse : oui, changement de fournisseur à noter pour l'ouverture.
- **Q16. Devise des dépenses ?** Recommandé : devise de référence, taux BCE figé. Réponse : choisir la devise à la saisie, euro par défaut. Repris en Q19.
- **Q17. À la fusion ?** Recommandé : migrer le projet de production, garder le projet v2 comme préversion. Réponse : oui.

### Tour 4 : les détails qui en découlent

- **Q18. Google pour les lieux ?** L'assistant distingue : Google est meilleur pour restaurants et activités (avis, horaires, photos), OSM pour campings, aires, points d'eau et sentiers ; les conditions de Google interdisent le stockage hors ligne. Recommandé : OSM comme socle, Google en fiche enrichie à la demande. Réponse : d'accord, si on peut ajouter un lieu Google comme étape. Traité en Q23.
- **Q19. Devise proposée ?** Recommandé : dernière devise utilisée (euro au départ), totaux en euros au taux BCE figé, taux récupéré au retour du réseau. Réponse : oui.
- **Q20. Dépenses à plus de deux ?** Recommandé : payeur, bénéficiaires cochés, poids, remboursements minimisés. Réponse : oui.
- **Q21. Fuseau horaire par étape, hors ligne ?** Recommandé : oui. Réponse : oui.
- **Q22. Accueil ?** Recommandé : liste des voyages, ouverture directe sur Voyager pendant un voyage, Planifier et Voyager conservés. Réponse : oui, sans surcharger l'accueil.

### Tour 5 : Google, la validation, le périmètre

- **Q23. Un lieu Google comme étape ?** Recommandé : `place_id` stocké, coordonnées rafraîchies tous les 30 jours. Réponse : si OSM a presque tout, garder OSM ; alors à quoi sert Google ? L'assistant corrige (OSM n'a pas presque tout : il est inégal sur les restaurants et activités) et constate qu'un lien Google Maps sans clé couvre l'essentiel.
- **Q24. Critère de fin ?** Recommandé : un voyage fictif scandinave commité, plus la migration du voyage NZ. Réponse : oui, le voyage fictif sert aux tests, que l'assistant fait et vérifie visuellement lui-même.
- **Q25. Liste des exclusions ?** Recommandé : oui. Réponse : oui.
- **Q26. Plan, ADR, maquettes avant le code ?** Recommandé : oui. Réponse : oui.
- **Q27. Liens Google Maps à la place de la clé ?** Réponse : seulement si le lien pointe vers le même lieu que la fiche OSM, sinon on abandonne et les gens font l'aller-retour vers Google eux-mêmes, comme avec CamperMate. Fait : sans clé, un lien Google Maps ne peut que lancer une recherche par nom et coordonnées ; rien ne garantit qu'il ouvre le même lieu (OSM ne porte pas d'identifiant Google). **Abandonné** selon la condition posée : aucune clé ni aucun lien de fiche Google dans la v2. Les boutons de guidage vers Google Maps et Plans de la v1 restent (ils partent de coordonnées).

## Ce que la séance n'avait pas vu

En préparant le lot 0, l'assistant a trouvé que la préversion sur `/vanTravelApp/next/` (Q11) ne tient pas :

- même origine `elienowominski.github.io` : la v2 partagerait les bases IndexedDB et le `localStorage` de la v1 (`vantravel`, `vantravel-kv`, `vantravel-docs`, clés `vantravel-*`), et sa migration de schéma réécrirait les données de la v1 sur le même téléphone ;
- le service worker de la v1 a pour portée `/vanTravelApp/` et renvoie `index.html` de la v1 pour toute navigation dans cette portée, `/next/` compris ;
- GitHub Pages ne publie qu'un site par dépôt : construire les deux versions oblige à modifier `deploy.yml` sur `main`, gelé (Q4).

Options présentées : une préversion sur une autre origine (déploiement de branche chez Netlify, Vercel ou Cloudflare Pages, recommandé), le développement local seul, ou le sous-chemin cloisonné (qui touche `main`). Réponse : **local seulement**. Conséquences : port de dev 43218 sur la branche pour une origine distincte de la v1 locale, pas de test hors ligne sur l'iPhone avant la fusion, projet `vanTravelApp-v2` relancé à la main après une pause (ADR 0001).

## Avant, après (cible)

| | v1 (2 nov. 2026) | v2 visée |
| --- | --- | --- |
| Utilisateurs | deux personnes | des proches invités, ouverture au public préparée |
| Géographie | une région câblée (`nz-south`), catalogue de lieux commité | n'importe où, pays, fuseaux et devises déduits des étapes |
| Déplacement | un van | un mode par tronçon : van, voiture, moto, puis train et marche |
| Lieux | catalogue NZ et calques DOC générés au build | OSM chargé à la demande, mis en cache le long du tracé ; DOC pour la NZ seulement |
| Fuseau | un par région | un par étape, calculé hors ligne |
| Dépenses | total par devise, deux personnes à parts égales | totaux en euros au taux figé, bénéficiaires et poids |
| Accueil | un voyage ouvert d'office | liste des voyages, Voyager d'office pendant un voyage |
| Création | région imposée, dates et départ | nom, dates, départ, arrivée, mode, véhicule |
| Accès | membres d'un voyage | rôles propriétaire, éditeur, lecteur ; plafonds par compte |
| Google | liens de guidage | inchangé : pas de clé, pas de fiche |
| Chiffres | 23 commits, 134 fichiers sous `src`, environ 15 300 lignes TypeScript, 17 fichiers de test, 109 tests | à relever à la fusion |
