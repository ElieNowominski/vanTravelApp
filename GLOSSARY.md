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

**Point d'intérêt** :
Un lieu utile en route lu sur OSM : camping, aire de camping-car, vidange, point d'eau. Il peut devenir une étape.
_Avoid_: POI (dans les textes), spot (réservé au catalogue de la v1)

**Couloir** :
La bande de quelques kilomètres de part et d'autre des tracés d'un itinéraire figé, dont les points d'intérêt sont gardés pour le hors ligne.

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

**Propriétaire** :
Le compte qui a créé le voyage sur le serveur : il invite, change les rôles, retire et supprime. Son rôle ne change pas.

**Éditeur** :
Un participant qui lit et modifie tout le voyage (itinéraire, réservations, dépenses, documents).

**Lecteur** :
Un participant qui reçoit tout le voyage et n'envoie rien ; ses modifications restent sur son appareil.

**Plafond d'usage** :
Le nombre de demandes par compte et par jour à un service à quota (recherche de lieux, points d'intérêt), au-delà duquel l'app ne l'appelle plus jusqu'au lendemain (UTC).

**Payeur** :
Le participant qui a réglé une dépense.

**Bénéficiaire** :
Un participant concerné par une dépense, avec un poids dans sa répartition.

**Devise de référence** :
La devise dans laquelle se calculent les totaux et les remboursements : l'euro.
