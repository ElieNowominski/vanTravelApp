#!/usr/bin/env node
/**
 * Contrôle des règles d'accès (RLS) du projet Supabase, avec deux comptes de test e-mail et mot de passe
 * créés pour l'occasion (jamais les vrais comptes). À relancer après tout changement de schéma.
 *
 * Variables d'environnement :
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   (par défaut lues dans .env.next.local, projet vanTravelApp-v2 de la branche v2)
 *   RLS_A_EMAIL, RLS_A_PASSWORD              compte A (propriétaire du voyage de test)
 *   RLS_B_EMAIL, RLS_B_PASSWORD              compte B (tiers, puis membre)
 *
 * Usage : node scripts/rls-check.mjs
 *
 * Ce que le script vérifie, table par table et bucket compris :
 *   1. B ne lit ni ne modifie rien du voyage de A (trips, itineraries, travel_items, expenses, deletions, members, documents) ;
 *   2. B ne peut pas s'ajouter lui-même ni ajouter quelqu'un au voyage de A ;
 *   3. A ajoute B comme lecteur : B lit tout, n'écrit rien et ne change pas son rôle (migration 0004) ;
 *   4. A réinvite B sans rôle, B devient éditeur : il voit tout et peut écrire ;
 *   5. B, éditeur mais pas propriétaire, ne peut toujours pas ajouter un membre, changer un rôle ni supprimer le voyage ;
 *      la ligne du propriétaire ne se retire pas ; B peut se retirer lui-même ;
 *   6. l'anonyme (clé publiable seule) n'a aucun droit sur les tables et peut seulement appeler beat() ;
 *      un compte connecté n'a aucun droit sur heartbeat, usage_limits et usage en écriture (droits explicites) ;
 *   7. plafonds : consume_quota accepte jusqu'au plafond du service fictif « rls-check », refuse au-delà sans compter,
 *      chacun ne lit que sa consommation.
 * Le voyage de test est supprimé à la fin (A, propriétaire), fichiers du bucket compris. Le compteur du service
 * fictif reste plein pour la journée : une relance le même jour ne vérifie que le refus.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Branche v2 : jamais de repli sur .env.local, qui pointe sur la production.
function readEnvLocal() {
  const file = path.resolve(".env.next.local");
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
if (!url || !key) die("SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY manquants (ou .env.next.local absent).");
console.log(`Projet contrôlé : ${new URL(url).host}`);
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

  // 6. Anonyme et droits explicites.
  {
    for (const table of ["trips", "travel_items", "members", "profiles", "usage_limits"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      check(`anonyme : aucun droit sur ${table}`, !!error && (data ?? []).length === 0, error?.code);
    }
    const { error } = await anon.rpc("beat");
    check("anonyme : beat() accepté", !error, error?.message);
    const { data: hb } = await anon.from("heartbeat").select("beat_at");
    check("anonyme : heartbeat invisible", (hb ?? []).length === 0);
    const { error: e1 } = await anon.rpc("consume_quota", { p_service: "rls-check" });
    check("anonyme : consume_quota refusé", !!e1, e1?.code);
    const { error: e2 } = await anon.rpc("create_trip", { p_config: { ...config, id: `${TRIP}-anon` } });
    check("anonyme : create_trip refusé", !!e2, e2?.code);
    const { error: e3 } = await b.client.from("heartbeat").select("beat_at");
    check("connecté : aucun droit sur heartbeat", !!e3, e3?.code);
    const { error: e4 } = await b.client.from("usage_limits").insert({ service: "intrus", daily_per_user: 1000000 });
    check("connecté : usage_limits en lecture seule", !!e4, e4?.code);
    const { error: e5 } = await b.client.from("usage").insert({ user_id: b.user.id, service: "rls-check", day: "2000-01-01", count: 0 });
    check("connecté : usage sans écriture directe", !!e5, e5?.code);
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

  // 3. A ajoute B comme lecteur.
  {
    const { error } = await a.client.rpc("add_member_by_email", { p_trip: TRIP, p_email: B.email, p_role: "viewer" });
    check("A ajoute B comme lecteur", !error, error?.message);
    const { error: eRole } = await a.client.rpc("add_member_by_email", { p_trip: TRIP, p_email: B.email, p_role: "owner" });
    check("add_member_by_email : rôle owner refusé", !!eRole, eRole?.message);
    const { data: mine } = await asB.from("members").select("role").eq("trip_id", TRIP).eq("user_id", b.user.id);
    check("B lecteur : son rôle est viewer", mine?.[0]?.role === "viewer", mine?.[0]?.role);
    const { data: items } = await asB.from("travel_items").select("id").eq("trip_id", TRIP);
    check("B lecteur : lit les entités", (items ?? []).length === 1);
    const { data: dl, error: eDl } = await asB.storage.from("documents").download(docPath);
    check("B lecteur : lit le document", !eDl && !!dl, eDl?.message);
    const { error: e1 } = await asB.rpc("upsert_travel_items", { items: [{ ...item, id: "rls-viewer", payload: { ...item.payload, id: "rls-viewer" }, updated_by: "b" }] });
    const { data: leaked } = await a.client.from("travel_items").select("id").eq("trip_id", TRIP).eq("id", "rls-viewer");
    check("B lecteur : upsert_travel_items refusé", !!e1 && (leaked ?? []).length === 0, e1?.message);
    const { error: e2 } = await asB.rpc("upsert_expenses", { items: [{ ...expense, id: "rls-viewer-exp", payload: { ...expense.payload, id: "rls-viewer-exp" } }] });
    check("B lecteur : upsert_expenses refusé", !!e2, e2?.message);
    const { error: e3 } = await asB.rpc("upsert_deletions", { items: [{ trip_id: TRIP, entity_id: item.id, deleted_at: NOW }] });
    check("B lecteur : upsert_deletions refusé", !!e3, e3?.message);
    await asB.from("itineraries").update({ updated_by: "b" }).eq("trip_id", TRIP);
    const { data: itin } = await a.client.from("itineraries").select("updated_by").eq("trip_id", TRIP);
    check("B lecteur : itinéraire intact", itin?.[0]?.updated_by === "a");
    await asB.from("travel_items").delete().eq("trip_id", TRIP).eq("id", item.id);
    const { data: kept } = await a.client.from("travel_items").select("id").eq("trip_id", TRIP).eq("id", item.id);
    check("B lecteur : suppression d'entité sans effet", (kept ?? []).length === 1);
    const { error: e4 } = await asB.storage.from("documents").upload(`${TRIP}/lecteur.txt`, new Blob(["x"]), { upsert: false });
    check("B lecteur : envoi de document refusé", !!e4, e4?.message);
    await asB.storage.from("documents").remove([docPath]);
    const { data: files } = await a.client.storage.from("documents").list(TRIP);
    check("B lecteur : document non supprimé", (files ?? []).some((f) => `${TRIP}/${f.name}` === docPath));
    const { error: e5 } = await asB.rpc("set_member_role", { p_trip: TRIP, p_user: b.user.id, p_role: "editor" });
    check("B lecteur : set_member_role refusé", !!e5, e5?.message);
    const { error: e6 } = await asB.from("members").update({ role: "owner" }).eq("trip_id", TRIP).eq("user_id", b.user.id);
    const { data: still } = await a.client.from("members").select("role").eq("trip_id", TRIP).eq("user_id", b.user.id);
    check("B lecteur : update direct de members refusé", !!e6 && still?.[0]?.role === "viewer", e6?.code);
  }

  // 4. A réinvite B sans rôle : B devient éditeur (rôle par défaut, ligne existante mise à jour).
  {
    const { error } = await a.client.rpc("add_member_by_email", { p_trip: TRIP, p_email: B.email });
    check("A réinvite B sans rôle", !error, error?.message);
    const { data: role } = await a.client.from("members").select("role").eq("trip_id", TRIP).eq("user_id", b.user.id);
    check("B devient éditeur", role?.[0]?.role === "editor", role?.[0]?.role);
    const { error: eSet } = await a.client.rpc("set_member_role", { p_trip: TRIP, p_user: b.user.id, p_role: "viewer" });
    const { error: eBack } = await a.client.rpc("set_member_role", { p_trip: TRIP, p_user: b.user.id, p_role: "editor" });
    check("A change le rôle de B (lecteur puis éditeur)", !eSet && !eBack, (eSet ?? eBack)?.message);
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

  // 5. B éditeur, pas propriétaire.
  {
    const { error: e1 } = await asB.rpc("add_member_by_email", { p_trip: TRIP, p_email: A.email });
    check("B membre : add_member_by_email refusé", !!e1, e1?.message);
    const { error: e2 } = await asB.from("members").delete().eq("trip_id", TRIP).eq("user_id", a.user.id);
    const { data: owners } = await a.client.from("members").select("user_id").eq("trip_id", TRIP);
    check("B membre : ne retire personne", !e2 && (owners ?? []).length === 2);
    const { error: e3 } = await asB.rpc("set_member_role", { p_trip: TRIP, p_user: a.user.id, p_role: "viewer" });
    check("B éditeur : set_member_role refusé", !!e3, e3?.message);
    await asB.from("trips").delete().eq("id", TRIP);
    const { data: stillThere } = await a.client.from("trips").select("id").eq("id", TRIP);
    check("B membre : suppression du voyage sans effet", (stillThere ?? []).length === 1);
    const { error: e4 } = await a.client.rpc("set_member_role", { p_trip: TRIP, p_user: a.user.id, p_role: "viewer" });
    check("A ne change pas son propre rôle", !!e4, e4?.message);
    await a.client.from("members").delete().eq("trip_id", TRIP).eq("user_id", a.user.id);
    const { data: ownerRow } = await a.client.from("members").select("role").eq("trip_id", TRIP).eq("user_id", a.user.id);
    check("A ne retire pas sa ligne de propriétaire", ownerRow?.[0]?.role === "owner");
    const { error: e5 } = await asB.from("members").delete().eq("trip_id", TRIP).eq("user_id", b.user.id);
    const { data: gone } = await asB.from("travel_items").select("id").eq("trip_id", TRIP);
    check("B se retire du voyage et ne le lit plus", !e5 && (gone ?? []).length === 0, e5?.message);
  }

  // 7. Plafonds, sur le service fictif « rls-check » (plafond 3 par compte et par jour).
  {
    const { data: limits } = await a.client.from("usage_limits").select("daily_per_user").eq("service", "rls-check");
    const limit = limits?.[0]?.daily_per_user;
    check("plafonds : lisibles par un compte", typeof limit === "number", String(limit));
    const today = new Date().toISOString().slice(0, 10);
    const { data: before } = await a.client.from("usage").select("count").eq("service", "rls-check").eq("day", today);
    const used = before?.[0]?.count ?? 0;
    if (typeof limit === "number" && used < limit) {
      const { data, error } = await a.client.rpc("consume_quota", { p_service: "rls-check", p_units: limit - used });
      check("consume_quota : accepté jusqu'au plafond", !error && data?.allowed === true && data?.remaining === 0, error?.message ?? JSON.stringify(data));
    }
    const { data: refused, error: eRef } = await a.client.rpc("consume_quota", { p_service: "rls-check" });
    check("consume_quota : refusé au plafond", !eRef && refused?.allowed === false && refused?.scope === "user", eRef?.message ?? JSON.stringify(refused));
    const { data: after } = await a.client.from("usage").select("count").eq("service", "rls-check").eq("day", today);
    check("consume_quota : un refus ne compte pas", after?.[0]?.count === limit, String(after?.[0]?.count));
    const { error: eUnknown } = await a.client.rpc("consume_quota", { p_service: "inconnu" });
    check("consume_quota : service inconnu refusé", !!eUnknown, eUnknown?.message);
    const { error: eZero } = await a.client.rpc("consume_quota", { p_service: "rls-check", p_units: 0 });
    check("consume_quota : zéro unité refusé", !!eZero, eZero?.message);
    const { data: others } = await asB.from("usage").select("count").eq("user_id", a.user.id);
    check("consommation : B ne lit pas celle de A", (others ?? []).length === 0);
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
