#!/usr/bin/env node
/**
 * Migration des voyages du dépôt privé (dossier trips/) vers Supabase, lancée en local.
 *
 * Pas de clé secrète : le script se connecte avec le compte propriétaire (e-mail et mot de passe) et la
 * clé publiable, donc sous les mêmes règles RLS que l'app. Un compte créé avec Google peut se donner un
 * mot de passe par « Mot de passe oublié » dans l'app (même e-mail : les deux identités sont liées).
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   (par défaut lues dans .env.local : VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
 *   SUPABASE_EMAIL, SUPABASE_PASSWORD        compte propriétaire des voyages migrés
 *   PRIVATE_DATA_DIR                         dossier du dépôt privé (défaut ../vanTravel)
 *
 * Usage : node scripts/migrate-from-private-repo.mjs [--trip <id>] [--dry-run]
 *
 * Pour chaque voyage de trips/index.json : create_trip (ignoré s'il existe déjà), itinerary.json ->
 * itineraries (seulement s'il n'y en a pas encore), travel.json et expenses.json -> lignes (upsert « si
 * plus récent », donc relançable), tombstones -> deletions, docs/ -> bucket documents.
 *
 * Alternative sans script : dans l'app, sur le PC qui a tout en local, « Mettre « nom » sur le compte ».
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyTrip = args.includes("--trip") ? args[args.indexOf("--trip") + 1] : null;

function readEnvLocal() {
  const file = path.resolve(".env.local");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

const envLocal = readEnvLocal();
const url = process.env.SUPABASE_URL || envLocal.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || envLocal.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.SUPABASE_EMAIL;
const password = process.env.SUPABASE_PASSWORD;
const dataDir = path.resolve(process.env.PRIVATE_DATA_DIR || "../vanTravel");

if (!url || !key) fail("SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY manquants (ou .env.local absent).");
if (!email || !password) fail("SUPABASE_EMAIL et SUPABASE_PASSWORD manquants.");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function exists(file) {
  return fs.existsSync(file);
}

/** Même découpage que src/lib/sync-rows.ts (copié : le script tourne hors du bundle). */
function travelDocToRows(tripId, doc) {
  const rows = [];
  const stamped = (id, kind, scope, value, at) => rows.push({ id, trip_id: tripId, kind, scope, payload: { value, at }, updated_at: at, updated_by: "" });
  for (const [stopId, stop] of Object.entries(doc.stops ?? {})) {
    for (const b of stop.bookings ?? []) rows.push({ id: b.id, trip_id: tripId, kind: "booking", scope: stopId, payload: b, updated_at: b.updatedAt, updated_by: b.updatedBy ?? "" });
    for (const d of stop.documents ?? []) rows.push({ id: d.id, trip_id: tripId, kind: "document", scope: stopId, payload: d, updated_at: d.updatedAt, updated_by: d.updatedBy ?? "" });
    for (const c of stop.checklist ?? []) rows.push({ id: c.id, trip_id: tripId, kind: "checklist", scope: stopId, payload: c, updated_at: c.updatedAt, updated_by: c.updatedBy ?? "" });
    if (stop.notesAt) stamped(`${stopId}:notes`, "stop_notes", stopId, stop.notes, stop.notesAt);
  }
  for (const [date, day] of Object.entries(doc.days ?? {})) {
    if (day.notesAt) stamped(`${date}:notes`, "day_notes", date, day.notes, day.notesAt);
    if (day.weatherAt) stamped(`${date}:weather`, "day_weather", date, day.weather, day.weatherAt);
  }
  return rows;
}

function expensesToRows(tripId, doc) {
  return (doc.expenses ?? []).map((e) => ({ id: e.id, trip_id: tripId, payload: e, updated_at: e.updatedAt, updated_by: e.updatedBy ?? "" }));
}

function tombstonesToRows(tripId, tombstones) {
  return Object.entries(tombstones ?? {}).map(([entity_id, deleted_at]) => ({ trip_id: tripId, entity_id, deleted_at }));
}

function mimeOf(file) {
  const ext = path.extname(file).toLowerCase();
  return ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
}

async function rpc(client, fn, params, context) {
  if (dryRun) return;
  const { data, error } = await client.rpc(fn, params);
  if (error) throw new Error(`${context} : ${error.message}`);
  return data;
}

async function inChunks(client, fn, rows, context) {
  for (let i = 0; i < rows.length; i += 200) await rpc(client, fn, { items: rows.slice(i, i + 200) }, context);
}

async function main() {
  const indexFile = path.join(dataDir, "trips", "index.json");
  if (!exists(indexFile)) fail(`Introuvable : ${indexFile}`);
  const trips = readJson(indexFile).trips.filter((t) => !onlyTrip || t.id === onlyTrip);
  if (trips.length === 0) fail("Aucun voyage à migrer.");

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError) fail(`Connexion refusée : ${authError.message}`);
  console.log(`Connecté : ${auth.user.email} (${auth.user.id})${dryRun ? " [simulation]" : ""}`);

  for (const entry of trips) {
    const dir = path.join(dataDir, "trips", entry.id);
    const tripFile = path.join(dir, "trip.json");
    if (!exists(tripFile)) {
      console.warn(`- ${entry.id} : pas de trip.json, ignoré`);
      continue;
    }
    const config = readJson(tripFile);
    const tripId = config.id || entry.id;
    console.log(`\n== ${tripId} (${config.name || entry.name})`);

    // Voyage et membre propriétaire.
    const { data: existing } = await client.from("trips").select("id, owner_id").eq("id", tripId).maybeSingle();
    if (existing) {
      console.log(`  voyage déjà sur le compte${existing.owner_id === auth.user.id ? "" : " (propriétaire : quelqu'un d'autre)"}`);
    } else {
      await rpc(client, "create_trip", { p_config: config }, "create_trip");
      console.log("  voyage créé");
    }

    // Itinéraire : seulement s'il n'y en a pas encore (sinon « Envoyer mon itinéraire » depuis l'app).
    const itinFile = path.join(dir, "itinerary.json");
    if (exists(itinFile)) {
      const { data: remote } = await client.from("itineraries").select("updated_at").eq("trip_id", tripId).maybeSingle();
      if (remote) {
        console.log(`  itinéraire déjà présent (${remote.updated_at}), conservé`);
      } else {
        const itin = readJson(itinFile);
        if (!dryRun) {
          const { error } = await client.from("itineraries").insert({
            trip_id: tripId,
            format: itin.format ?? 1,
            snapshot: itin.snapshot,
            marks: Array.isArray(itin.marks) ? itin.marks : [],
            updated_at: itin.updatedAt ?? new Date().toISOString(),
            updated_by: itin.updatedBy ?? "migration",
          });
          if (error) throw new Error(`itinéraire : ${error.message}`);
        }
        console.log(`  itinéraire envoyé (${Math.round(fs.statSync(itinFile).size / 1024)} Ko)`);
      }
    }

    // Entités, dépenses, suppressions.
    let tombstones = {};
    const travelFile = path.join(dir, "travel.json");
    if (exists(travelFile)) {
      const travel = readJson(travelFile);
      const rows = travelDocToRows(tripId, travel);
      await inChunks(client, "upsert_travel_items", rows, "travel_items");
      tombstones = { ...tombstones, ...(travel.tombstones ?? {}) };
      console.log(`  ${rows.length} entrées (réservations, documents, coches, notes)`);
    }
    const expensesFile = path.join(dir, "expenses.json");
    if (exists(expensesFile)) {
      const expenses = readJson(expensesFile);
      const rows = expensesToRows(tripId, expenses);
      await inChunks(client, "upsert_expenses", rows, "expenses");
      tombstones = { ...tombstones, ...(expenses.tombstones ?? {}) };
      console.log(`  ${rows.length} dépenses`);
    }
    const deletions = tombstonesToRows(tripId, tombstones);
    if (deletions.length > 0) {
      await inChunks(client, "upsert_deletions", deletions, "deletions");
      console.log(`  ${deletions.length} suppressions`);
    }

    // Documents : docs/<docId>.<ext> -> bucket documents/<tripId>/<docId>.<ext>.
    const docsDir = path.join(dir, "docs");
    if (exists(docsDir)) {
      let sent = 0;
      let kept = 0;
      for (const name of fs.readdirSync(docsDir)) {
        const file = path.join(docsDir, name);
        if (!fs.statSync(file).isFile()) continue;
        if (dryRun) {
          sent++;
          continue;
        }
        const { error } = await client.storage.from("documents").upload(`${tripId}/${name}`, fs.readFileSync(file), { upsert: false, contentType: mimeOf(name) });
        if (!error) sent++;
        else if (/already exists|duplicate/i.test(error.message)) kept++;
        else throw new Error(`document ${name} : ${error.message}`);
      }
      console.log(`  ${sent} documents envoyés, ${kept} déjà présents`);
    }
  }

  await client.auth.signOut();
  console.log("\nTerminé. Sur chaque appareil : se connecter, « Utiliser » le voyage, puis « Recevoir l’itinéraire du compte » si besoin.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
