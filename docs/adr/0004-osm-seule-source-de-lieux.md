# OSM comme seule source de lieux, aucune clé Google

Les étapes et les points d'intérêt viennent d'OpenStreetMap (recherche Photon, requêtes Overpass) et la v2 n'a pas de clé API Google. Les conditions de Google Places ne permettent de conserver que le `place_id` sans limite et les coordonnées 30 jours, incompatibles avec un itinéraire stocké et consultable hors ligne. Une clé dans le front ne se limite pas par utilisateur, et l'app doit rester gratuite. Pour les avis et les horaires des restaurants et des activités, les gens font l'aller-retour vers Google eux-mêmes, comme avec CamperMate.

## Considered Options

- Google Places en complément à la demande, derrière une Edge Function Supabase avec un quota par compte : utile pour les restaurants et les activités, écarté pour son coût en complexité (fonction, quotas, rafraîchissement des coordonnées tous les 30 jours, attribution) dans une app privée et gratuite.
- Lien « Voir sur Google Maps » sans clé, à partir du nom et des coordonnées du lieu OSM : écarté parce que rien ne garantit qu'il ouvre le même lieu (OSM ne porte pas d'identifiant Google), condition posée par la personne.

## Consequences

Les boutons de guidage de la v1 vers Google Maps et Plans restent : ils partent de coordonnées et n'utilisent aucune API. La question revient à l'ouverture au public ou si une recherche d'activités dans l'app devient un besoin.
