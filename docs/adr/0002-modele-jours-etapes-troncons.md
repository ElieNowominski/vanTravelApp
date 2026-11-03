# Un seul modèle de voyage, le mode de déplacement porté par le tronçon

Tous les types de voyage (road trip, Interrail, trek) partagent la même structure : un voyage est une suite de jours, un jour contient des étapes, et entre deux étapes un tronçon porte un mode (van, voiture, moto, train, ferry, vélo, marche) et un tracé calculé, importé ou absent. Le mode par défaut vit au niveau du voyage. Ce choix permet les voyages mixtes (train jusqu'à Oslo, puis van, puis deux jours de marche), au prix d'un modèle plus abstrait que celui de la v1, où tout le voyage se faisait avec un seul `Vehicle`.

## Considered Options

- Un modèle par type de voyage : plus simple à écrire, mais incapable de représenter un voyage mixte.
