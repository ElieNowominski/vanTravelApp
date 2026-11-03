import { describe, expect, it } from "vitest";
import { parseBackup } from "@/lib/backup";
import { allExpenses, defaultExpenseCurrency, settleUp, totalsByCurrency } from "@/lib/expenses";
import { legDurationSec } from "@/lib/legs";
import { migrateSnapshot } from "@/lib/migrations";
import { placeZone } from "@/lib/place-zone";
import { normalizeTripConfig } from "@/lib/trip-config";
import { computeZone, currentTravelDate, tripPoints, zoneLabel } from "@/lib/zone";
import { catalogRegionIds } from "@/lib/catalog";
import fixture from "../../fixtures/reference-scandinavie.json";

/**
 * Voyage fictif de référence de la v2 (`fixtures/reference-scandinavie.json`, généré par
 * `scripts/make-reference-trip.mjs`) : critère de réussite du lot 1 et jeu de données des parcours à l'écran.
 */
const backup = parseBackup(JSON.stringify(fixture));
const raw = backup.savedTrips[0];
const trip = migrateSnapshot(raw);
const config = normalizeTripConfig(raw.config);

describe("voyage de référence : Scandinavie en van", () => {
  it("se lit comme une sauvegarde de l'app, déjà au schéma courant", () => {
    expect(backup.savedTrips).toHaveLength(1);
    expect(trip.schemaVersion).toBe(5);
    expect(migrateSnapshot(trip)).toEqual(trip);
    expect(config).toEqual(raw.config);
    expect(config?.defaultMode).toBe("van");
  });

  it("dix jours, neuf nuits, un aller simple de Copenhague à Stockholm", () => {
    expect(trip.days).toHaveLength(10);
    expect(trip.days.filter((d) => d.overnightStopId)).toHaveLength(9);
    expect(config?.start.name).toBe("Copenhague");
    expect(config?.end.name).toBe("Stockholm");
  });

  it("trois pays dans l'ordre du voyage, sans catalogue ni calques néo-zélandais", () => {
    const zone = computeZone(tripPoints(config, trip), placeZone);
    expect(zone.countries).toEqual(["DK", "NO", "SE"]);
    expect(zoneLabel(zone.countries)).toBe("Danemark, Norvège, Suède");
    expect(catalogRegionIds(config)).toEqual([]);
  });

  it("des tronçons en van calculés et un ferry sans tracé", () => {
    const ferry = trip.legs.filter((leg) => leg.mode === "ferry");
    expect(ferry).toHaveLength(1);
    expect(ferry[0]).toMatchObject({ track: "aucun", options: [] });
    expect(legDurationSec(ferry[0])).toBe(3 * 3600 + 15 * 60);
    const road = trip.legs.filter((leg) => leg.mode === "van");
    expect(road.length).toBeGreaterThan(8);
    expect(road.every((leg) => leg.track === "calcule" && leg.options[0].geometry.coordinates.length > 1)).toBe(true);
  });

  it("chaque tronçon relie deux étapes existantes, dans l'ordre des jours", () => {
    for (const leg of trip.legs) {
      expect(trip.stops[leg.fromStopId]).toBeDefined();
      expect(trip.stops[leg.toStopId]).toBeDefined();
      expect(trip.days[leg.dayIndex].stopIds).toContain(leg.toStopId);
    }
  });

  it("dépenses à trois en quatre devises", () => {
    const expenses = allExpenses(trip.days);
    expect(Object.keys(totalsByCurrency(expenses)).sort()).toEqual(["DKK", "EUR", "NOK", "SEK"]);
    expect(new Set(expenses.map((e) => e.paidBy))).toEqual(new Set(["Alex", "Sam", "Noa"]));
    expect(defaultExpenseCurrency(expenses)).toBe("SEK");
    expect(settleUp(expenses, ["Alex", "Sam", "Noa"]).length).toBeGreaterThan(0);
  });

  it("« aujourd'hui » suit le fuseau des étapes pendant le voyage", () => {
    expect(currentTravelDate(trip, config, placeZone, new Date("2027-06-05T10:00:00Z"))).toBe("2027-06-05");
    // 23 h 30 UTC le 5 juin : déjà le 6 en Norvège (UTC+2).
    expect(currentTravelDate(trip, config, placeZone, new Date("2027-06-05T23:30:00Z"))).toBe("2027-06-06");
  });
});
