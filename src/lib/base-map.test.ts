import { describe, expect, it } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "maplibre-gl";
import {
  BASE_OVERLAYS,
  BASE_OVERLAY_LAYER_IDS,
  LABEL_TEXT_FIELD,
  describeBaseFeature,
  isClickableBaseLabel,
  localizeBaseStyle,
  nearestTo,
  type BaseOverlayKey,
} from "@/lib/base-map";

/** Calques qui retiennent un lieu de la couche `poi`, filtres évalués par le moteur de MapLibre. */
function overlaysOf(props: Record<string, string>): BaseOverlayKey[] {
  return BASE_OVERLAYS.filter((o) => featureFilter(o.filter as never, `layers[${o.key}].filter`).filter({ zoom: 15 } as never, { type: 1, properties: props } as never)).map(
    (o) => o.key,
  );
}

describe("calques superposés", () => {
  it("rangent les lieux des tuiles dans la bonne famille", () => {
    expect(overlaysOf({ class: "campsite", subclass: "caravan_site" })).toEqual(["baseCamps"]);
    expect(overlaysOf({ class: "lodging", subclass: "hotel" })).toEqual(["baseLodging"]);
    expect(overlaysOf({ class: "cafe", subclass: "cafe" })).toEqual(["baseFood"]);
    expect(overlaysOf({ class: "beer", subclass: "pub" })).toEqual(["baseFood"]);
    expect(overlaysOf({ class: "grocery", subclass: "supermarket" })).toEqual(["baseShops"]);
    expect(overlaysOf({ class: "shop", subclass: "convenience" })).toEqual(["baseShops"]);
    expect(overlaysOf({ class: "fuel", subclass: "charging_station" })).toEqual(["baseFuel"]);
    expect(overlaysOf({ class: "attraction", subclass: "viewpoint" })).toEqual(["baseSights"]);
    expect(overlaysOf({ class: "art_gallery", subclass: "gallery" })).toEqual(["baseSights"]);
    expect(overlaysOf({ class: "toilets", subclass: "toilets" })).toEqual(["baseServices"]);
    expect(overlaysOf({ class: "drinking_water", subclass: "drinking_water" })).toEqual(["baseServices"]);
  });

  it("laissent de côté le bruit : œuvres d'art, poubelles, parkings, arrêts de bus", () => {
    for (const props of [
      { class: "art_gallery", subclass: "artwork" },
      { class: "waste_basket", subclass: "waste_basket" },
      { class: "parking", subclass: "parking" },
      { class: "bus", subclass: "bus_stop" },
    ]) {
      expect(overlaysOf(props)).toEqual([]);
    }
  });

  it("ont un calque de points et un calque de noms chacun", () => {
    expect(BASE_OVERLAY_LAYER_IDS).toHaveLength(BASE_OVERLAYS.length * 2);
    expect(new Set(BASE_OVERLAY_LAYER_IDS).size).toBe(BASE_OVERLAY_LAYER_IDS.length);
  });
});

describe("noms du fond", () => {
  it("rend cliquables les lieux habités et les lieux, pas les pays, régions ni routes", () => {
    expect(isClickableBaseLabel({ id: "label_village", type: "symbol", "source-layer": "place" })).toBe(true);
    expect(isClickableBaseLabel({ id: "poi_r1", type: "symbol", "source-layer": "poi" })).toBe(true);
    expect(isClickableBaseLabel({ id: "label_country_1", type: "symbol", "source-layer": "place" })).toBe(false);
    expect(isClickableBaseLabel({ id: "label_state", type: "symbol", "source-layer": "place" })).toBe(false);
    expect(isClickableBaseLabel({ id: "highway-name-major", type: "symbol", "source-layer": "transportation_name" })).toBe(false);
    expect(isClickableBaseLabel({ id: "building", type: "fill", "source-layer": "building" })).toBe(false);
  });

  it("affiche le nom français puis le nom local à la place du nom anglais du style", () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["get", "name_en"] } },
        { id: "highway-name-major", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", layout: { "text-field": "{name}" } },
        { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water" },
      ],
    } as unknown as StyleSpecification;
    const out = localizeBaseStyle(style);
    expect((out.layers[0] as { layout: Record<string, unknown> }).layout["text-field"]).toEqual(LABEL_TEXT_FIELD);
    expect(out.layers[1]).toBe(style.layers[1]);
    expect(out.layers[2]).toBe(style.layers[2]);
    expect(style.layers[0]).toMatchObject({ layout: { "text-field": ["get", "name_en"] } });
  });
});

describe("lieu touché", () => {
  const at = { lng: 5.32412, lat: 60.39503 };

  it("décrit un café en français et en fait une étape", () => {
    const { title, subtitle, place } = describeBaseFeature({ name: "M.A.S.H.", class: "cafe", subclass: "cafe" }, "poi", at);
    expect(title).toBe("M.A.S.H.");
    expect(subtitle).toBe("Café · OpenStreetMap");
    expect(place).toMatchObject({ name: "M.A.S.H.", kind: "poi", lng: 5.32412, lat: 60.39503, placeId: "osm-fond:5.32412,60.39503" });
  });

  it("préfère le nom français et range un lieu habité en ville, un camping en camping", () => {
    expect(describeBaseFeature({ name: "København", "name:fr": "Copenhague", class: "city" }, "place", at)).toMatchObject({
      title: "Copenhague",
      subtitle: "Ville · OpenStreetMap",
      place: { kind: "town" },
    });
    expect(describeBaseFeature({ name: "Håreina", class: "hamlet" }, "place", at).subtitle).toBe("Hameau · OpenStreetMap");
    expect(describeBaseFeature({ name: "Lothepus camping", class: "campsite", subclass: "caravan_site" }, "poi", at)).toMatchObject({
      subtitle: "Aire de camping-car · OpenStreetMap",
      place: { kind: "camp" },
    });
  });

  it("reste lisible sans nom ni classe connue", () => {
    expect(describeBaseFeature({ class: "pitch", subclass: "tennis" }, "poi", at)).toMatchObject({ title: "Lieu", subtitle: "Lieu · OpenStreetMap" });
  });

  it("choisit le candidat le plus proche du doigt", () => {
    const candidates = [
      { item: "Håreina", x: 110, y: 100 },
      { item: "Flåm", x: 103, y: 101 },
    ];
    expect(nearestTo(candidates, 102, 100)).toBe("Flåm");
    expect(nearestTo([], 0, 0)).toBeUndefined();
  });
});
