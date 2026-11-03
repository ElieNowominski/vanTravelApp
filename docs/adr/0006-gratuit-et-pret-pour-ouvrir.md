# Gratuit tant que l'app est privée, mais prête pour une inscription ouverte

La v2 sert à la personne, à sa compagne et à des proches invités ; l'inscription ouverte viendra peut-être plus tard. La v2 pose donc dès maintenant ce qui coûte cher à rattraper (rôles par voyage propriétaire, éditeur, lecteur ; plafonds d'usage par compte sur tout service à quota ; cloisonnement par les règles par ligne) et reporte ce qui relève d'un produit public (conditions d'utilisation, RGPD, suppression de compte, nom de domaine, support). Le coût reste à 0 € : une fonctionnalité à quota se bloque proprement au plafond, le cœur de l'app ne se bloque jamais.

## Consequences

Le serveur de démonstration OSRM, acceptable pour quelques utilisateurs, devra être remplacé avant l'ouverture (OpenRouteService ou GraphHopper derrière une Edge Function).

Les plafonds d'usage (migration 0004) sont un compteur que le client consulte avant d'appeler un service public gratuit : un garde-fou de courtoisie, pas une barrière, puisque Photon et Overpass sont appelés depuis le navigateur. À quelques utilisateurs, ils protègent surtout d'un bogue qui enverrait des requêtes en boucle ; la protection de fond reste côté client (attente de fin de frappe, une requête par seconde, cache). Une barrière réelle, nécessaire pour une ouverture au public, passerait par un relais (Edge Function) qui compte et appelle le service à la place du navigateur. Gardés dès la v2 à la demande de la personne (3 nov. 2026), alors que l'assistant proposait de les reporter à l'ouverture.
