import { describe, expect, it } from "vitest";
import {
  dayIndexForDate,
  daysBetween,
  defaultMode,
  departureOf,
  directionsLinks,
  mapsDirectionsUrl,
  maskSecret,
  summarizeDay,
  telHref,
  todayInZone,
  tripPhase,
} from "@/lib/voyager";
import type { Stop, TripSnapshot } from "@/lib/types";

const config = { start: { placeId: "chc", date: "2027-02-07" }, end: { placeId: "chc", date: "2027-02-19" } };

function stop(id: string, name: string, overnight = false): Stop {
  return {
    id,
    placeId: id,
    name,
    lng: 170,
    lat: -44,
    kind: "town",
    isOvernight: overnight,
    activities: [],
    bookings: [],
    documents: [],
    checklist: [],
  };
}

const snapshot: TripSnapshot = {
  currentDayIndex: 0,
  customPins: [],
  days: [
    { date: "2027-02-07", label: "", weekday: "", locked: true, overnightStopId: "s2", stopIds: ["s1", "s2"], expenses: [] },
    { date: "2027-02-08", label: "", weekday: "", locked: true, overnightStopId: "s4", stopIds: ["s3", "s4"], expenses: [] },
    { date: "2027-02-09", label: "", weekday: "", locked: false, overnightStopId: null, stopIds: [], expenses: [] },
  ],
  stops: {
    s1: stop("s1", "Christchurch"),
    s2: stop("s2", "Tekapo", true),
    s3: stop("s3", "Mount Cook"),
    s4: { ...stop("s4", "Wānaka", true), bookings: [{ id: "b1", updatedAt: "", updatedBy: "", provider: "Lakeview", reference: "R1", accessCode: "1234", phone: "+64 3 443 0000" }] },
  },
  legs: [
    { id: "l1", fromStopId: "s1", toStopId: "s2", dayIndex: 0, selectedIndex: 0, estimated: false, options: [{ label: "", distanceKm: 226, durationCarSec: 9000, durationVanSec: 11700, winding: false, geometry: { type: "LineString", coordinates: [] } }] },
    { id: "l2", fromStopId: "s2", toStopId: "s3", dayIndex: 1, selectedIndex: 0, estimated: true, options: [{ label: "", distanceKm: 100, durationCarSec: 4000, durationVanSec: 5200, winding: false, geometry: { type: "LineString", coordinates: [] } }] },
    { id: "l3", fromStopId: "s3", toStopId: "s4", dayIndex: 1, selectedIndex: 0, estimated: false, options: [{ label: "", distanceKm: 200, durationCarSec: 8000, durationVanSec: 10400, winding: true, geometry: { type: "LineString", coordinates: [] } }] },
  ],
};

describe("todayInZone", () => {
  it("donne la date du fuseau de la région, pas celle de la machine", () => {
    // 23 h UTC le 6 février = 12 h le 7 février à Auckland (UTC+13 en été).
    const now = new Date("2027-02-06T23:00:00Z");
    expect(todayInZone("Pacific/Auckland", now)).toBe("2027-02-07");
    expect(todayInZone("Europe/Paris", now)).toBe("2027-02-07");
    expect(todayInZone("America/Los_Angeles", now)).toBe("2027-02-06");
  });
});

describe("defaultMode", () => {
  it("planifie avant le voyage, voyage pendant, planifie après", () => {
    expect(tripPhase(config, "2027-01-01")).toBe("before");
    expect(tripPhase(config, "2027-02-10")).toBe("during");
    expect(tripPhase(config, "2027-03-01")).toBe("after");
    expect(defaultMode(config, null, "2027-01-01")).toBe("plan");
    expect(defaultMode(config, null, "2027-02-07")).toBe("travel");
    expect(defaultMode(config, null, "2027-02-19")).toBe("travel");
    expect(defaultMode(config, null, "2027-02-20")).toBe("plan");
  });

  it("voyage dès que l'itinéraire est figé, planifie sans voyage", () => {
    expect(defaultMode(config, "2026-09-29T10:00:00Z", "2026-09-29")).toBe("travel");
    expect(defaultMode(null, "2026-09-29T10:00:00Z", "2026-09-29")).toBe("plan");
  });
});

describe("dayIndexForDate", () => {
  it("trouve le jour exact ou borne aux extrémités", () => {
    expect(dayIndexForDate(snapshot.days, "2027-02-08")).toBe(1);
    expect(dayIndexForDate(snapshot.days, "2027-01-01")).toBe(0);
    expect(dayIndexForDate(snapshot.days, "2027-03-01")).toBe(2);
    expect(dayIndexForDate([], "2027-02-08")).toBe(-1);
  });

  it("compte les jours entre deux dates", () => {
    expect(daysBetween("2026-09-29", "2027-02-07")).toBe(131);
    expect(daysBetween("2027-02-07", "2027-02-07")).toBe(0);
    expect(daysBetween("2027-02-08", "2027-02-07")).toBe(-1);
  });
});

describe("summarizeDay", () => {
  it("jour 1 : départ = première étape, prochaine = la suivante", () => {
    const s = summarizeDay(snapshot, 0)!;
    expect(s.departure?.name).toBe("Christchurch");
    expect(s.nextStop?.name).toBe("Tekapo");
    expect(s.overnight?.name).toBe("Tekapo");
    expect(s.km).toBe(226);
    expect(s.driveSec).toBe(11700);
    expect(s.tonightBooking).toBeNull();
  });

  it("jour suivant : départ = nuit précédente, réservation de la nuit exposée", () => {
    const s = summarizeDay(snapshot, 1)!;
    expect(departureOf(snapshot, 1)?.name).toBe("Tekapo");
    expect(s.nextStop?.name).toBe("Mount Cook");
    expect(s.overnight?.name).toBe("Wānaka");
    expect(s.tonightBooking?.reference).toBe("R1");
    expect(s.km).toBe(300);
    expect(s.estimated).toBe(true);
  });

  it("jour vide : pas d'étape, départ hérité", () => {
    const s = summarizeDay(snapshot, 2)!;
    expect(s.stops).toEqual([]);
    expect(s.departure?.name).toBe("Wānaka");
    expect(s.nextStop).toBeNull();
    expect(summarizeDay(snapshot, 9)).toBeNull();
  });
});

describe("liens et masquage", () => {
  it("propose Plans avant Google Maps sur iPhone, Google Maps seul ailleurs", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    expect(directionsLinks(-44, 170, iphone).map((l) => l.label)).toEqual(["Plans", "Google Maps"]);
    expect(directionsLinks(-44, 170, iphone)[0]?.href).toBe("https://maps.apple.com/?daddr=-44.000000,170.000000");
    expect(directionsLinks(-44, 170, "Mozilla/5.0 (Linux; Android 14) Chrome/128.0").map((l) => l.label)).toEqual(["Google Maps"]);
  });

  it("construit l'URL Google Maps et le lien tel", () => {
    expect(mapsDirectionsUrl(-44.0, 170.0)).toBe("https://www.google.com/maps/dir/?api=1&destination=-44.000000,170.000000");
    expect(telHref("+64 3 443 0000")).toBe("tel:+6434430000");
    expect(telHref("03-443 0000 (réception)")).toBe("tel:034430000");
  });

  it("masque sans trahir la longueur exacte", () => {
    expect(maskSecret("12")).toBe("••••");
    expect(maskSecret("123456")).toBe("••••••");
    expect(maskSecret("1234567890123")).toBe("••••••••");
  });
});
