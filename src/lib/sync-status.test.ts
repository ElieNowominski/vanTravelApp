import { describe, expect, it } from "vitest";
import { describeItinerarySync, formatRelativeSync, syncBadge } from "@/lib/sync-status";

describe("syncBadge", () => {
  it("hiérarchise : non configurée, en cours, hors ligne, erreur, en attente, ok", () => {
    expect(syncBadge({ configured: false, status: "error", pending: true, online: true }).kind).toBe("unconfigured");
    expect(syncBadge({ configured: true, status: "syncing", pending: true, online: false }).kind).toBe("syncing");
    expect(syncBadge({ configured: true, status: "idle", pending: true, online: false })).toEqual({ kind: "offline", label: "Hors ligne, modifications en attente" });
    expect(syncBadge({ configured: true, status: "error", pending: false, online: true }).kind).toBe("error");
    expect(syncBadge({ configured: true, status: "idle", pending: true, online: true }).kind).toBe("pending");
    expect(syncBadge({ configured: true, status: "idle", pending: false, online: true }).kind).toBe("ok");
  });
});

describe("describeItinerarySync", () => {
  const T = "2027-02-07T08:00:00.000Z";
  it("annonce envoi, réception, conflit ou rien à faire", () => {
    expect(describeItinerarySync({ hasLocal: true, localChangedAt: null, hasRemote: false, remoteChanged: false })).toMatch(/sera envoyé/);
    expect(describeItinerarySync({ hasLocal: false, localChangedAt: null, hasRemote: false, remoteChanged: false })).toMatch(/plan du voyage/);
    expect(describeItinerarySync({ hasLocal: false, localChangedAt: null, hasRemote: true, remoteChanged: true })).toMatch(/sera reçu/);
    expect(describeItinerarySync({ hasLocal: true, localChangedAt: T, hasRemote: true, remoteChanged: true })).toMatch(/Recevoir » ou « Envoyer/);
    expect(describeItinerarySync({ hasLocal: true, localChangedAt: T, hasRemote: true, remoteChanged: false })).toMatch(/sera envoyé au compte/);
    expect(describeItinerarySync({ hasLocal: true, localChangedAt: null, hasRemote: true, remoteChanged: true })).toMatch(/remplacera celui de cet appareil/);
    expect(describeItinerarySync({ hasLocal: true, localChangedAt: null, hasRemote: true, remoteChanged: false })).toMatch(/identique/);
  });
});

describe("formatRelativeSync", () => {
  const now = new Date("2027-02-10T12:00:00.000Z");
  it("parle en minutes, heures, jours puis date", () => {
    expect(formatRelativeSync(null, now)).toBe("jamais");
    expect(formatRelativeSync("2027-02-10T11:59:40.000Z", now)).toBe("à l’instant");
    expect(formatRelativeSync("2027-02-10T11:45:00.000Z", now)).toBe("il y a 15 min");
    expect(formatRelativeSync("2027-02-10T09:00:00.000Z", now)).toBe("il y a 3 h");
    expect(formatRelativeSync("2027-02-09T10:00:00.000Z", now)).toBe("hier");
    expect(formatRelativeSync("2027-02-07T10:00:00.000Z", now)).toBe("il y a 3 jours");
    expect(formatRelativeSync("2027-01-10T10:00:00.000Z", now)).toBe("2027-01-10");
    expect(formatRelativeSync("n'importe quoi", now)).toBe("jamais");
  });
});
