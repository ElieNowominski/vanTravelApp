# vanTravel

Application de voyage itinérant : préparer un voyage, puis le suivre sur place, hors ligne, à plusieurs.

## Voyage

**Voyage** :
Un séjour itinérant daté, avec un départ, une arrivée et des participants.
_Avoid_: trip (dans les textes), circuit (réservé au brouillon d'itinéraire de la v1)

**Jour** :
Une date calendaire du voyage, qui regroupe des étapes.

**Étape** :
Un lieu où le voyage s'arrête : ville, camping, refuge, gare, point de vue. Une étape peut être la nuit du jour.
_Avoid_: stop (dans les textes), point

**Tronçon** :
Le trajet entre deux étapes consécutives, avec un mode de déplacement et éventuellement un tracé.
_Avoid_: leg (dans les textes), segment, trajet

**Mode** :
La façon de parcourir un tronçon : van, voiture, moto, train, ferry, vélo, marche.
_Avoid_: type de voyage

**Tracé** :
La ligne suivie par un tronçon sur la carte, calculée, importée ou absente.

**Zone** :
L'étendue géographique couverte par les étapes d'un voyage, avec les pays traversés.
_Avoid_: région (réservé aux préréglages de la v1)

**Figer** :
Arrêter l'itinéraire pour l'alléger et le rendre consultable hors ligne.

## Véhicule

**Profil de déplacement** :
Les caractéristiques du moyen de transport d'un voyage (gabarit, autonomie, rythme) qui influencent les temps et les routes.
_Avoid_: véhicule (pour la v2)

**Préréglage** :
Un profil de déplacement standard (van aménagé, camping-car, voiture, moto) que l'on copie dans un voyage puis que l'on ajuste.

## Participants et dépenses

**Participant** :
Une personne qui prend part au voyage, avec un rôle : propriétaire, éditeur ou lecteur.
_Avoid_: membre

**Payeur** :
Le participant qui a réglé une dépense.

**Bénéficiaire** :
Un participant concerné par une dépense, avec un poids dans sa répartition.

**Devise de référence** :
La devise dans laquelle se calculent les totaux et les remboursements : l'euro.
