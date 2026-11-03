import { describe, expect, it } from "vitest";
import { canWrite, parseRole, roleRank } from "@/lib/roles";

describe("parseRole", () => {
  it("garde les rôles connus", () => {
    expect(parseRole("owner")).toBe("owner");
    expect(parseRole("editor")).toBe("editor");
    expect(parseRole("viewer")).toBe("viewer");
  });

  it("ramène une valeur inconnue à lecteur", () => {
    expect(parseRole("admin")).toBe("viewer");
    expect(parseRole(null)).toBe("viewer");
    expect(parseRole(undefined)).toBe("viewer");
  });
});

describe("canWrite", () => {
  it("propriétaire et éditeur écrivent, lecteur non", () => {
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("editor")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
  });

  it("rôle inconnu : pas d'écriture", () => {
    expect(canWrite(null)).toBe(false);
    expect(canWrite(undefined)).toBe(false);
  });
});

describe("roleRank", () => {
  it("trie propriétaire, éditeurs, lecteurs", () => {
    const sorted = (["viewer", "owner", "editor"] as const).slice().sort((a, b) => roleRank(a) - roleRank(b));
    expect(sorted).toEqual(["owner", "editor", "viewer"]);
  });
});
