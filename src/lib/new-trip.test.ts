import { describe, expect, it } from "vitest";
import { buildNewTripConfig, durationLabel, newTripError, travelChoice, type NewTripInput } from "@/lib/new-trip";
import { validateTripConfig } from "@/lib/trip-config";
import type { PlaceInput } from "@/lib/types";

const copenhague: PlaceInput = { placeId: "osm:r1", name: "Copenhague", lng: 12.57, lat: 55.68, kind: "town", area: "Capitale, Danemark" };
const stockholm: PlaceInput = { placeId: "osm:r2", name: "Stockholm", lng: 18.07, lat: 59.33, kind: "town", area: "Suède" };

const input = (patch: Partial<NewTripInput> = {}): NewTripInput => ({
  name: "Scandinavie en van",
  startDate: "2027-06-01",
  endDate: "2027-06-10",
  start: copenhague,
  end: stockholm,
  roundTrip: false,
  choice: "van",
  ...patch,
});

describe("newTripError", () => {
  it("accepte une saisie complète", () => {
    expect(newTripError(input())).toBeNull();
  });

  it("signale le premier manque, dans l'ordre de l'écran", () => {
    expect(newTripError(input({ name: "  " }))).toMatch(/nom/);
    expect(newTripError(input({ endDate: "" }))).toMatch(/dates/);
    expect(newTripError(input({ endDate: "2027-05-30" }))).toMatch(/précède/);
    expect(newTripError(input({ start: null }))).toMatch(/départ/);
    expect(newTripError(input({ end: null }))).toMatch(/arrivée/);
  });

  it("n'exige pas d'arrivée pour un retour au départ", () => {
    expect(newTripError(input({ end: null, roundTrip: true }))).toBeNull();
  });
});

describe("durationLabel", () => {
  it("compte jours et nuits", () => {
    expect(durationLabel("2027-06-01", "2027-06-10")).toBe("10 jours, 9 nuits");
    expect(durationLabel("2027-06-01", "2027-06-02")).toBe("2 jours, 1 nuit");
    expect(durationLabel("2027-06-01", "2027-06-01")).toBe("1 jour");
  });

  it("reste vide sans dates valides", () => {
    expect(durationLabel("", "2027-06-01")).toBe("");
    expect(durationLabel("2027-06-10", "2027-06-01")).toBe("");
  });
});

describe("travelChoice", () => {
  it("prend mode et profil du préréglage de véhicule", () => {
    expect(travelChoice("camping-car")).toMatchObject({ defaultMode: "van", profile: { presetId: "camping-car", heightM: 3 } });
    expect(travelChoice("moto")).toMatchObject({ defaultMode: "moto", profile: { presetId: "moto" } });
  });

  it("garde le profil van derrière train, vélo et marche", () => {
    expect(travelChoice("train")).toMatchObject({ defaultMode: "train", profile: { presetId: "van" } });
    expect(travelChoice("marche").defaultMode).toBe("marche");
  });
});

describe("buildNewTripConfig", () => {
  it("pose départ et arrivée avec leur position et leur localisation", () => {
    const config = buildNewTripConfig(input({ choice: "voiture" }));
    expect(config).toMatchObject({
      id: "trip-scandinavie-en-van-2027-06-01",
      name: "Scandinavie en van",
      defaultMode: "voiture",
      start: { placeId: "osm:r1", date: "2027-06-01", name: "Copenhague", lng: 12.57, lat: 55.68, area: "Capitale, Danemark" },
      end: { placeId: "osm:r2", date: "2027-06-10", name: "Stockholm", area: "Suède" },
      profile: { presetId: "voiture" },
    });
  });

  it("met l'arrivée au départ pour un retour au point de départ", () => {
    const config = buildNewTripConfig(input({ roundTrip: true, end: stockholm }));
    expect(config.end).toMatchObject({ placeId: "osm:r1", name: "Copenhague", date: "2027-06-10" });
  });

  it("produit un voyage que la validation relit à l'identique, localisation comprise", () => {
    const config = buildNewTripConfig(input());
    expect(validateTripConfig(JSON.parse(JSON.stringify(config)))).toMatchObject({ start: { area: "Capitale, Danemark" }, end: { area: "Suède" } });
  });

  it("refuse une saisie incomplète", () => {
    expect(() => buildNewTripConfig(input({ start: null }))).toThrow(/départ/);
  });
});
