#!/usr/bin/env node
/**
 * Génère le voyage fictif de référence de la v2 (lot 1 de docs/PLAN-v2.md) : Copenhague -> Stockholm en van,
 * 10 jours, trois pays (DK, NO, SE), quatre devises, un ferry sans tracé, trois participants.
 * Aucune donnée personnelle : lieux publics, réservation et dépenses inventées.
 *
 * Sortie : fixtures/reference-scandinavie.json, au format de sauvegarde de l'app (version 3), importable par
 * « Importer un fichier » sur l'écran de démarrage. Sert aux tests Vitest et aux parcours dans le navigateur.
 *
 * Les tracés viennent du serveur public OSRM (une requête par seconde, règle 8) ; le fichier généré est commité,
 * le script ne se relance que pour changer le voyage. Usage : node scripts/make-reference-trip.mjs
 */
import fs from "node:fs";
import path from "node:path";

const OSRM = "https://router.project-osrm.org/route/v1/driving";
const OUT = path.resolve("fixtures/reference-scandinavie.json");
const UPDATED_BY = "Alex";

/** Profil « van » des préréglages (src/lib/profiles.ts). */
const profile = {
  presetId: "van",
  mode: "van",
  name: "Van aménagé",
  selfContained: true,
  timeFactor: 1.3,
  windingFactor: 1.15,
  maxComfortableDriveHours: 4,
};

const places = {
  copenhague: { name: "Copenhague", lng: 12.5683, lat: 55.6761, kind: "town" },
  aarhus: { name: "Camping, Aarhus", lng: 10.2039, lat: 56.1629, kind: "camp" },
  hirtshals: { name: "Port de Hirtshals", lng: 9.9617, lat: 57.5925, kind: "poi" },
  kristiansand: { name: "Camping, Kristiansand", lng: 7.9956, lat: 58.1467, kind: "camp" },
  stavanger: { name: "Camping, Stavanger", lng: 5.7331, lat: 58.97, kind: "camp" },
  odda: { name: "Camping, Odda", lng: 6.5444, lat: 60.0694, kind: "camp" },
  bergen: { name: "Camping, Bergen", lng: 5.3221, lat: 60.3913, kind: "camp" },
  floyen: { name: "Mont Fløyen", lng: 5.3436, lat: 60.3955, kind: "poi" },
  flam: { name: "Camping, Flåm", lng: 7.1135, lat: 60.8628, kind: "camp" },
  oslo: { name: "Camping, Oslo", lng: 10.7522, lat: 59.9139, kind: "camp" },
  karlstad: { name: "Camping, Karlstad", lng: 13.5036, lat: 59.3793, kind: "camp" },
  stockholm: { name: "Stockholm", lng: 18.0686, lat: 59.3293, kind: "town" },
};

/** Jours : étapes dans l'ordre (le départ d'un jour est la nuit de la veille), nuit marquée par « * ». */
const plan = [
  ["2027-06-01", ["copenhague", "aarhus*"]],
  ["2027-06-02", ["hirtshals", "kristiansand*"]],
  ["2027-06-03", ["stavanger*"]],
  ["2027-06-04", ["odda*"]],
  ["2027-06-05", ["bergen*"]],
  ["2027-06-06", ["floyen", "bergen*"]],
  ["2027-06-07", ["flam*"]],
  ["2027-06-08", ["oslo*"]],
  ["2027-06-09", ["karlstad*"]],
  ["2027-06-10", ["stockholm"]],
];

/** Tronçons sans tracé : le ferry Hirtshals -> Kristiansand, horaires inventés. */
const manualLegs = {
  "hirtshals>kristiansand": {
    mode: "ferry",
    manual: { durationSec: 3 * 3600 + 15 * 60, distanceKm: 140, departAt: "8 h 00", arriveAt: "11 h 15", operator: "Traversée de démonstration" },
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round5 = (n) => Math.round(n * 1e5) / 1e5;
const iso = (date, hour) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;

function profileDurationSec(rawSec, distanceKm) {
  const hours = rawSec / 3600;
  const avgKmh = hours > 0 ? distanceKm / hours : 80;
  const winding = avgKmh < 48;
  let factor = profile.timeFactor;
  if (winding) factor *= profile.windingFactor;
  else if (avgKmh < 58) factor *= 1.08;
  return { durationSec: Math.round(rawSec * factor), winding };
}

async function route(from, to) {
  const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
  const res = await fetch(url, { headers: { "User-Agent": "vantravel-app/0.2 (+https://github.com/ElieNowominski/vanTravelApp)" } });
  if (!res.ok) throw new Error(`OSRM ${res.status} ${from.name} -> ${to.name}`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error(`OSRM sans itinéraire ${from.name} -> ${to.name}`);
  const r = data.routes[0];
  const distanceKm = Math.round(r.distance / 100) / 10;
  const adjusted = profileDurationSec(r.duration, distanceKm);
  return {
    geometry: { type: "LineString", coordinates: r.geometry.coordinates.map(([x, y]) => [round5(x), round5(y)]) },
    distanceKm,
    durationRawSec: Math.round(r.duration),
    durationSec: adjusted.durationSec,
    winding: adjusted.winding,
    label: "Recommandée",
  };
}

function dayLabel(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(d).replace(".", "");
  const label = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), label };
}

const empty = () => ({ activities: [], bookings: [], documents: [], checklist: [] });

async function main() {
  const stops = {};
  const days = [];
  const legs = [];
  let previous = null;
  let counter = 0;

  for (const [dayIndex, [date, keys]] of plan.entries()) {
    const day = { date, ...dayLabel(date), locked: false, overnightStopId: null, stopIds: [], expenses: [] };
    for (const raw of keys) {
      const key = raw.replace("*", "");
      const isNight = raw.endsWith("*");
      const place = places[key];
      const id = dayIndex === 0 && counter === 0 ? "stop-start" : `ref-stop-${++counter}`;
      if (id === "stop-start") counter++;
      stops[id] = { id, placeId: `ref-${key}`, name: place.name, lng: place.lng, lat: place.lat, kind: place.kind, isOvernight: isNight, ...empty() };
      day.stopIds.push(id);
      if (isNight) day.overnightStopId = id;
      if (previous) {
        const pair = `${previous.key}>${key}`;
        const manual = manualLegs[pair];
        const base = { id: `ref-leg-${legs.length + 1}`, fromStopId: previous.id, toStopId: id, dayIndex, selectedIndex: 0, estimated: false };
        if (manual) {
          legs.push({ ...base, mode: manual.mode, track: "aucun", options: [], manual: manual.manual });
        } else {
          console.log(`Route ${places[previous.key].name} -> ${place.name}`);
          legs.push({ ...base, mode: "van", track: "calcule", options: [await route(places[previous.key], place)] });
          await sleep(1100);
        }
      }
      previous = { id, key };
    }
    days.push(day);
  }

  const stopOf = (key, dayIndex) => days[dayIndex].stopIds.find((id) => stops[id].placeId === `ref-${key}`);

  // Réservation et checklist inventées, pour les écrans Voyager.
  stops[stopOf("kristiansand", 1)].bookings.push({
    id: "ref-booking-1",
    updatedAt: iso("2027-05-01", 10),
    updatedBy: UPDATED_BY,
    provider: "Camping de démonstration",
    reference: "DEMO-0001",
    accessCode: "0000",
    checkIn: "15 h",
    price: { amount: 420, currency: "NOK" },
  });
  stops[stopOf("bergen", 4)].checklist.push({ id: "ref-check-1", updatedAt: iso("2027-05-01", 10), updatedBy: UPDATED_BY, text: "Réserver le funiculaire", done: false });

  // Dépenses à trois, quatre devises.
  const expenses = [
    [0, "carburant", 620, "DKK", "Alex", null],
    [1, "transport", 189, "EUR", "Sam", stopOf("hirtshals", 1)],
    [2, "courses", 1150, "NOK", "Noa", null],
    [4, "camping", 450, "NOK", "Alex", stopOf("bergen", 4)],
    [5, "activite", 600, "NOK", "Sam", stopOf("floyen", 5)],
    [7, "resto", 980, "NOK", "Noa", null],
    [8, "carburant", 890, "SEK", "Alex", null],
    [9, "resto", 720, "SEK", "Sam", null],
  ];
  for (const [i, [dayIndex, category, amount, currency, paidBy, stopId]] of expenses.entries()) {
    const date = days[dayIndex].date;
    days[dayIndex].expenses.push({
      id: `ref-exp-${i + 1}`,
      updatedAt: iso(date, 18),
      updatedBy: paidBy,
      date,
      amount,
      currency,
      category,
      paidBy,
      ...(stopId ? { stopId } : {}),
    });
  }

  const milestone = (key, date) => ({ placeId: `ref-${key}`, date, name: places[key].name, lng: places[key].lng, lat: places[key].lat });
  const stays = Object.values(stops)
    .filter((s) => s.kind === "camp")
    .filter((s, i, all) => all.findIndex((o) => o.placeId === s.placeId) === i)
    .map((s) => ({ id: s.placeId, name: s.name, lng: s.lng, lat: s.lat, region: "", category: "campsite" }));
  const config = {
    id: "trip-reference-scandinavie",
    schemaVersion: 2,
    name: "Référence : Scandinavie en van",
    defaultMode: "van",
    start: milestone("copenhague", plan[0][0]),
    end: milestone("stockholm", plan[plan.length - 1][0]),
    profile,
    stays,
    plan: {
      days: days.map((day) => ({
        date: day.date,
        stops: day.stopIds.map((id) => ({ placeId: stops[id].placeId, ...(day.overnightStopId === id ? { overnight: true } : {}) })),
      })),
    },
  };

  const km = legs.reduce((sum, leg) => sum + (leg.track === "aucun" ? leg.manual.distanceKm ?? 0 : leg.options[0].distanceKm), 0);
  const trip = {
    id: "saved-reference-scandinavie",
    name: config.name,
    savedAt: iso("2027-05-01", 12),
    km: Math.round(km),
    nights: days.filter((d) => d.overnightStopId).length,
    marks: [],
    config,
    schemaVersion: 5,
    days,
    stops,
    legs,
    customPins: [],
    currentDayIndex: 0,
    frozenAt: null,
    tombstones: {},
    tripDocuments: [],
  };

  const backup = { app: "vantravel", version: 3, exportedAt: iso("2027-05-01", 12), draft: null, savedTrips: [trip], documents: {} };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(backup)}\n`);
  console.log(`${OUT} : ${legs.length} tronçons, ${Math.round(km)} km, ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
