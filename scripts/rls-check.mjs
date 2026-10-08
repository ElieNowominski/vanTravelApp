#!/usr/bin/env node
/**
 * Contrôle des règles d'accès (RLS) du projet Supabase, avec deux comptes de test e-mail et mot de passe
 * créés pour l'occasion (jamais les vrais comptes). À relancer après tout changement de schéma.
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   (par défaut lues dans .env.local)
 *   RLS_A_EMAIL, RLS_A_PASSWORD              compte A (propriétaire du voyage de test)
 *   RLS_B_EMAIL, RLS_B_PASSWORD              compte B (tiers, puis membre)
 *
 * Usage : node scripts/rls-check.mjs
 *
 * Ce que le script vérifie, table par table et bucket compris :
 *   1. B ne lit ni ne modifie rien du voyage de A (trips, itineraries, travel_items, expenses, deletions, members, documents) ;
 *   2. B ne peut pas s'ajouter lui-même ni ajouter quelqu'un au voyage de A ;
 *   3. A ajoute B par e-mail : B voit tout et peut écrire ;
 *   4. B, membre mais pas propriétaire, ne peut toujours pas ajouter un membre ni supprimer le voyage ;
 *   5. l'anonyme (clé publiable seule) ne lit rien et peut seulement appeler beat().
 * Le voyage de test est supprimé à la fin (A, propriétaire), fichiers du bucket compris.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
const A = { email: process.env.RLS_A_EMAIL, password: process.env.RLS_A_PASSWORD };
const B = { email: process.env.RLS_B_EMAIL, password: process.env.RLS_B_PASSWORD };
if (!url || !key) die("SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY manquants (ou .env.local absent).");
if (!A.email || !A.password || !B.email || !B.password) die("RLS_A_EMAIL, RLS_A_PASSWORD, RLS_B_EMAIL, RLS_B_PASSWORD requis.");

function die(message) {
  console.error(message);
  process.exit(1);
}

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "OK " : "KO "} ${label}${detail ? ` (${detail})` : ""}`);
}

async function signIn(creds) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword(creds);
  if (error) die(`Connexion ${creds.email} refusée : ${error.message}`);
  return { client, user: data.user };
}

const TRIP = `rls-check-${Date.now()}`;
const NOW = new Date().toISOString();
const config = {
  id: TRIP,
  schemaVersion: 1,
  name: "Contrôle RLS",
  regionId: "nz-south",
  start: { placeId: "christchurch", date: "2030-01-01" },
  end: { placeId: "christchurch", date: "2030-01-02" },
  vehicle: { name: "test", selfContained: true, timeFactor: 1, windingFactor: 1, maxComfortableDriveHours: 4 },
  stays: [],
  plan: { days: [] },
};
const item = { id: "rls-booking", trip_id: TRIP, kind: "booking", scope: "s1", payload: { id: "rls-booking", provider: "Test", updatedAt: NOW, updatedBy: "a" }, updated_at: NOW, updated_by: "a" };
const expense = { id: "rls-exp", trip_id: TRIP, payload: { id: "rls-exp", amount: 1, currency: "NZD", category: "autre", date: "2030-01-01", paidBy: "a", updatedAt: NOW, updatedBy: "a" }, updated_at: NOW, updated_by: "a" };
const docPath = `${TRIP}/rls-doc.txt`;

async function main() {
  const a = await signIn(A);
  const b = await signIn(B);
  const anon = createClient(url, key, { auth: { persistSession: false } });
  console.log(`A = ${a.user.email}, B = ${b.user.email}, voyage ${TRIP}\n`);

  // Mise en place par A.
  {
    const { error } = await a.client.rpc("create_trip", { p_config: config });
    check("A crée le voyage", !error, error?.message);
    const { error: e1 } = await a.client.from("itineraries").insert({ trip_id: TRIP, snapshot: { days: [], stops: {}, legs: [], customPins: [], currentDayIndex: 0 }, marks: [], updated_at: NOW, updated_by: "a" });
    check("A écrit l'itinéraire", !e1, e1?.message);
    const { error: e2 } = await a.client.rpc("upsert_travel_items", { items: [item] });
    check("A écrit une entité", !e2, e2?.message);
    const { error: e3 } = await a.client.rpc("upsert_expenses", { items: [expense] });
    check("A écrit une dépense", !e3, e3?.message);
    const { error: e4 } = await a.client.rpc("upsert_deletions", { items: [{ trip_id: TRIP, entity_id: "gone", deleted_at: NOW }] });
    check("A écrit une suppression", !e4, e4?.message);
    const { error: e5 } = await a.client.storage.from("documents").upload(docPath, new Blob(["rls"], { type: "text/plain" }), { upsert: false, contentType: "text/plain" });
    check("A envoie un document", !e5, e5?.message);
  }
  if (results.some((r) => !r.ok)) {
    console.log("\nLa mise en place par A échoue : les contrôles suivants n'auraient pas de sens. Vérifie que toutes les migrations de supabase/migrations/ ont été exécutées (SQL Editor), puis relance.");
    process.exit(2);
  }

  // 5. Anonyme.
  {
    const { data } = await anon.from("trips").select("id").eq("id", TRIP);
    check("anonyme : trips invisible", (data ?? []).length === 0);
    const { data: items } = await anon.from("travel_items").select("id").eq("trip_id", TRIP);
    check("anonyme : travel_items invisible", (items ?? []).length === 0);
    const { error } = await anon.rpc("beat");
    check("anonyme : beat() accepté", !error, error?.message);
    const { data: hb } = await anon.from("heartbeat").select("beat_at");
    check("anonyme : heartbeat invisible", (hb ?? []).length === 0);
  }

  // 1 et 2. B tiers.
  const asB = b.client;
  {
    const tables = ["trips", "itineraries", "travel_items", "expenses", "deletions", "members"];
    for (const table of tables) {
      const col = table === "trips" ? "id" : "trip_id";
      const { data } = await asB.from(table).select("*").eq(col, TRIP);
      check(`B tiers : ${table} invisible`, (data ?? []).length === 0);
    }
    const { error: e1 } = await asB.rpc("upsert_travel_items", { items: [{ ...item, id: "rls-b", payload: { ...item.payload, id: "rls-b", provider: "B" } }] });
    const { data: leaked } = await a.client.from("travel_items").select("id").eq("trip_id", TRIP).eq("id", "rls-b");
    check("B tiers : upsert_travel_items refusé", !!e1 && (leaked ?? []).length === 0, e1?.message);
    const { error: e2 } = await asB.from("travel_items").update({ updated_by: "b" }).eq("trip_id", TRIP).eq("id", item.id).select();
    const { data: still } = await a.client.from("travel_items").select("updated_by").eq("trip_id", TRIP).eq("id", item.id);
    check("B tiers : update direct sans effet", !e2 && still?.[0]?.updated_by === "a");
    const { error: e3 } = await asB.from("itineraries").update({ updated_by: "b" }).eq("trip_id", TRIP).select();
    const { data: itin } = await a.client.from("itineraries").select("updated_by").eq("trip_id", TRIP);
    check("B tiers : itinéraire intact", !e3 && itin?.[0]?.updated_by === "a");
    const { error: e4 } = await asB.from("members").insert({ trip_id: TRIP, user_id: b.user.id });
    check("B tiers : ne peut pas s'ajouter comme membre", !!e4, e4?.message);
    const { error: e5 } = await asB.rpc("add_member_by_email", { p_trip: TRIP, p_email: B.email });
    check("B tiers : add_member_by_email refusé", !!e5, e5?.message);
    const { data: dl, error: e6 } = await asB.storage.from("documents").download(docPath);
    check("B tiers : document illisible", !!e6 || !dl, e6?.message);
    const { error: e7 } = await asB.storage.from("documents").upload(`${TRIP}/intrus.txt`, new Blob(["x"]), { upsert: false });
    check("B tiers : envoi de document refusé", !!e7, e7?.message);
    const { error: e8 } = await asB.from("trips").delete().eq("id", TRIP);
    const { data: stillThere } = await a.client.from("trips").select("id").eq("id", TRIP);
    check("B tiers : suppression du voyage sans effet", !e8 && (stillThere ?? []).length === 1);
  }

  // 3. A ajoute B.
  {
    const { error } = await a.client.rpc("add_member_by_email", { p_trip: TRIP, p_email: B.email });
    check("A ajoute B par e-mail", !error, error?.message);
    const { data: trips } = await asB.from("members").select("role, trips(id, name)");
    check("B membre : voit le voyage", (trips ?? []).some((r) => r.trips?.id === TRIP));
    const { data: items } = await asB.from("travel_items").select("id").eq("trip_id", TRIP);
    check("B membre : lit les entités", (items ?? []).length === 1);
    const { error: e2 } = await asB.rpc("upsert_travel_items", { items: [{ ...item, id: "rls-b", payload: { ...item.payload, id: "rls-b", provider: "B" }, updated_by: "b" }] });
    check("B membre : écrit une entité", !e2, e2?.message);
    const { data: dl, error: e3 } = await asB.storage.from("documents").download(docPath);
    check("B membre : lit le document", !e3 && !!dl, e3?.message);
    const { data: profiles } = await asB.from("profiles").select("id").eq("id", a.user.id);
    check("B membre : voit le profil de A", (profiles ?? []).length === 1);
    // Verrou optimiste : une écriture avec un updated_at périmé ne touche rien.
    const { data: current } = await asB.from("itineraries").select("updated_at").eq("trip_id", TRIP).maybeSingle();
    const { data: stale } = await asB.from("itineraries").update({ updated_by: "b" }).eq("trip_id", TRIP).eq("updated_at", "2000-01-01T00:00:00Z").select();
    const { data: fresh } = current ? await asB.from("itineraries").update({ updated_by: "b" }).eq("trip_id", TRIP).eq("updated_at", current.updated_at).select() : { data: [] };
    check("verrou optimiste : updated_at périmé = 0 ligne, à jour = 1 ligne", !!current && (stale ?? []).length === 0 && (fresh ?? []).length === 1);
    // Upsert « si plus récent » : une ligne plus ancienne est ignorée.
    const old = { ...item, payload: { ...item.payload, provider: "Vieux" }, updated_at: "2000-01-01T00:00:00Z" };
    await asB.rpc("upsert_travel_items", { items: [old] });
    const { data: kept } = await asB.from("travel_items").select("payload").eq("trip_id", TRIP).eq("id", item.id).single();
    check("upsert si plus récent : l'ancien est ignoré", kept?.payload?.provider === "Test");
  }

  // 4. B membre, pas propriétaire.
  {
    const { error: e1 } = await asB.rpc("add_member_by_email", { p_trip: TRIP, p_email: A.email });
    check("B membre : add_member_by_email refusé", !!e1, e1?.message);
    const { error: e2 } = await asB.from("members").delete().eq("trip_id", TRIP).eq("user_id", a.user.id);
    const { data: owners } = await a.client.from("members").select("user_id").eq("trip_id", TRIP);
    check("B membre : ne retire personne", !e2 && (owners ?? []).length === 2);
    await asB.from("trips").delete().eq("id", TRIP);
    const { data: stillThere } = await a.client.from("trips").select("id").eq("id", TRIP);
    check("B membre : suppression du voyage sans effet", (stillThere ?? []).length === 1);
  }

  // Nettoyage par A.
  {
    const { data: files } = await a.client.storage.from("documents").list(TRIP);
    if (files?.length) await a.client.storage.from("documents").remove(files.map((f) => `${TRIP}/${f.name}`));
    const { error } = await a.client.from("trips").delete().eq("id", TRIP);
    check("A supprime le voyage de test (cascade)", !error, error?.message);
    const { data: gone } = await a.client.from("travel_items").select("id").eq("trip_id", TRIP);
    check("cascade : plus d'entités", (gone ?? []).length === 0);
  }

  await a.client.auth.signOut();
  await asB.auth.signOut();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} contrôles passés.`);
  if (failed.length) {
    console.log("Échecs : " + failed.map((f) => f.label).join(" ; "));
    process.exit(2);
  }
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
