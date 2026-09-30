import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isSecureEnvelope } from "@/lib/secure";

describe("enveloppe chiffrée des codes d'accès", () => {
  it("chiffre puis déchiffre avec la même phrase", async () => {
    const envelope = await encryptSecret("4521#", "kea-mange-les-joints");
    expect(isSecureEnvelope(envelope)).toBe(true);
    expect(envelope).not.toContain("4521");
    expect(await decryptSecret(envelope, "kea-mange-les-joints")).toBe("4521#");
  });

  it("rend null avec une mauvaise phrase ou une enveloppe altérée", async () => {
    const envelope = await encryptSecret("code", "bonne");
    expect(await decryptSecret(envelope, "mauvaise")).toBeNull();
    const parts = envelope.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(await decryptSecret(parts.join("."), "bonne")).toBeNull();
    expect(await decryptSecret("pas une enveloppe", "bonne")).toBeNull();
  });

  it("produit une enveloppe différente à chaque chiffrement (sel et IV aléatoires)", async () => {
    const a = await encryptSecret("x", "p");
    const b = await encryptSecret("x", "p");
    expect(a).not.toBe(b);
  });

  it("reconnaît le format sans se laisser piéger", () => {
    expect(isSecureEnvelope("v1.a.b.c")).toBe(true);
    expect(isSecureEnvelope("v2.a.b.c")).toBe(false);
    expect(isSecureEnvelope("4521")).toBe(false);
    expect(isSecureEnvelope(undefined)).toBe(false);
  });
});
