import { describe, expect, it } from "vitest";
import {
  isSearchable,
  mergePlaceOptions,
  normalizeQuery,
  parsePhotonResults,
  photonArea,
  photonKind,
  photonReverseUrl,
  photonSearchUrl,
  resultCaption,
  resultToPlaceInput,
  searchBias,
  waitBeforeRequest,
  type PlaceOption,
} from "@/lib/place-search";
import type { Stop, TripDay } from "@/lib/types";

const feature = (properties: Record<string, unknown>, coordinates: unknown = [5.3259192, 60.3943055]) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates },
});

// Forme réelle d'une réponse du serveur public (3 nov. 2026), réduite.
const bergen = feature({
  osm_type: "R",
  osm_id: 404159,
  osm_key: "place",
  osm_value: "municipality",
  type: "city",
  name: "Bergen",
  county: "Vestland",
  country: "Norvège",
  countrycode: "NO",
});

describe("requêtes Photon", () => {
  it("normalise la recherche pour le cache", () => {
    expect(normalizeQuery("  Flåm   Station ")).toBe("flåm station");
    expect(isSearchable("Os")).toBe(false);
    expect(isSearchable(" Oslo ")).toBe(true);
  });

  it("construit l'URL de recherche, en français, avec un point de préférence", () => {
    const url = new URL(photonSearchUrl(" Bergen  havn ", { bias: { lng: 5.32, lat: 60.39 } }));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(url.searchParams.get("q")).toBe("Bergen havn");
    expect(url.searchParams.get("lang")).toBe("fr");
    expect(url.searchParams.get("limit")).toBe("8");
    expect(url.searchParams.get("lat")).toBe("60.39000");
    expect(url.searchParams.get("lon")).toBe("5.32000");
    expect(url.searchParams.get("zoom")).toBe("7");
  });

  it("ne passe pas de point de préférence sans étape connue", () => {
    const url = new URL(photonSearchUrl("Bergen"));
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("zoom")).toBe(false);
  });

  it("construit l'URL de recherche inversée", () => {
    const url = new URL(photonReverseUrl({ lng: 5.32, lat: 60.39 }));
    expect(url.pathname).toBe("/reverse");
    expect(url.searchParams.get("limit")).toBe("1");
  });
});

describe("parsePhotonResults", () => {
  it("lit une ville avec son identifiant OSM, sa région et son pays", () => {
    expect(parsePhotonResults({ type: "FeatureCollection", features: [bergen] })).toEqual([
      {
        placeId: "osm:R404159",
        name: "Bergen",
        lng: 5.3259192,
        lat: 60.3943055,
        kind: "town",
        category: "Commune",
        area: "Vestland, Norvège",
        countryCode: "NO",
      },
    ]);
  });

  it("classe campings et aires comme hébergements, le reste comme points d'intérêt", () => {
    expect(photonKind("tourism", "camp_site")).toBe("camp");
    expect(photonKind("tourism", "caravan_site")).toBe("camp");
    expect(photonKind("railway", "station")).toBe("poi");
    expect(photonKind("place", "village")).toBe("town");
  });

  it("nomme une adresse sans nom par sa rue (recherche inversée)", () => {
    const [house] = parsePhotonResults({
      features: [
        feature({ osm_type: "N", osm_id: 1, osm_key: "place", osm_value: "house", housenumber: "4", street: "Bohrs gate", city: "Bergen", country: "Norvège" }),
      ],
    });
    expect(house.name).toBe("4 Bohrs gate");
    expect(house.area).toBe("Bergen, Norvège");
  });

  it("ignore les entrées sans nom, sans point ou en double", () => {
    const results = parsePhotonResults({
      features: [
        bergen,
        bergen,
        feature({ osm_key: "place", osm_value: "city" }),
        feature({ name: "Ligne", osm_key: "highway" }, null),
        { type: "Feature", properties: { name: "Polygone" }, geometry: { type: "Polygon", coordinates: [] } },
        feature({ name: "Bergen", osm_key: "place", osm_value: "city" }, [5.3259, 60.3943]),
      ],
    });
    expect(results.map((r) => r.placeId)).toEqual(["osm:R404159"]);
  });

  it("résiste à une réponse inattendue", () => {
    expect(parsePhotonResults(null)).toEqual([]);
    expect(parsePhotonResults({ features: "non" })).toEqual([]);
    expect(parsePhotonResults("<html>")).toEqual([]);
  });

  it("ne répète ni le nom ni deux fois la même région", () => {
    expect(photonArea({ city: "Oslo", state: "Oslo", country: "Norvège" }, "Oslo")).toBe("Norvège");
    expect(photonArea({ city: "Odda", county: "Vestland", country: "Norvège" }, "Odda Camping")).toBe("Odda, Vestland, Norvège");
    expect(photonArea({}, "Nulle part")).toBeUndefined();
  });
});

describe("résultat -> étape", () => {
  it("garde la source et le type dans meta", () => {
    const [result] = parsePhotonResults({
      features: [feature({ osm_type: "N", osm_id: 42, osm_key: "tourism", osm_value: "camp_site", name: "Odda Camping", city: "Odda", country: "Norvège" }, [6.54, 60.06])],
    });
    expect(resultCaption(result)).toBe("Camping · Odda, Norvège");
    expect(resultToPlaceInput(result)).toEqual({
      placeId: "osm:N42",
      name: "Odda Camping",
      lng: 6.54,
      lat: 60.06,
      kind: "camp",
      area: "Odda, Norvège",
      meta: { source: "osm", category: "Camping" },
    });
  });
});

describe("waitBeforeRequest", () => {
  it("garde une seconde entre deux requêtes", () => {
    expect(waitBeforeRequest(null, 5000)).toBe(0);
    expect(waitBeforeRequest(5000, 5300)).toBe(700);
    expect(waitBeforeRequest(5000, 7000)).toBe(0);
  });
});

describe("mergePlaceOptions", () => {
  const option = (name: string, lng: number, lat: number, source: "catalogue" | "osm"): PlaceOption => ({
    key: `${source}-${name}-${lng}`,
    name,
    caption: "",
    source,
    input: { placeId: `${source}-${name}`, name, lng, lat, kind: "town" },
  });

  it("place le catalogue d'abord et retire le même lieu trouvé sur OSM", () => {
    const local = [option("Tekapo", 170.48, -44.0, "catalogue")];
    const remote = [option("tekapo", 170.485, -44.004, "osm"), option("Tekapo", 10, 50, "osm"), option("Twizel", 170.1, -44.26, "osm")];
    expect(mergePlaceOptions(local, remote).map((o) => o.key)).toEqual(["catalogue-Tekapo-170.48", "osm-Tekapo-10", "osm-Twizel-170.1"]);
  });
});

describe("searchBias", () => {
  const stop = (id: string, lng: number) => ({ id, lng, lat: 60 }) as unknown as Stop;
  const snapshot = {
    days: [
      { date: "2027-06-01", stopIds: ["a", "b"] },
      { date: "2027-06-02", stopIds: [] },
    ] as unknown as TripDay[],
    stops: { a: stop("a", 5), b: stop("b", 6) },
  };

  it("prend la dernière étape posée jusqu'au jour en cours", () => {
    expect(searchBias(snapshot, 1, { lng: 1, lat: 1 })).toEqual({ lng: 6, lat: 60 });
  });

  it("retombe sur le départ, puis sur rien", () => {
    expect(searchBias({ days: [], stops: {} }, 0, { lng: 1, lat: 2 })).toEqual({ lng: 1, lat: 2 });
    expect(searchBias({ days: [], stops: {} }, 0, { lng: undefined, lat: undefined })).toBeNull();
  });
});
