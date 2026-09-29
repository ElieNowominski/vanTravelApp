import { describe, expect, it } from "vitest";
import { DOC_TARGET_BYTES, documentKind, extensionFor, fitWithin, nextAttempt } from "@/lib/image-compress";

describe("fitWithin", () => {
  it("réduit le plus grand côté sans agrandir", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("nextAttempt", () => {
  it("s'arrête dès que la cible est atteinte", () => {
    expect(nextAttempt({ quality: 0.85, maxSide: 1600 }, DOC_TARGET_BYTES, DOC_TARGET_BYTES)).toBeNull();
  });

  it("baisse la qualité puis la taille, et finit par abandonner", () => {
    const big = DOC_TARGET_BYTES * 3;
    const steps: Array<{ quality: number; maxSide: number }> = [];
    let attempt: { quality: number; maxSide: number } | null = { quality: 0.85, maxSide: 1600 };
    while (attempt) {
      attempt = nextAttempt(attempt, big, DOC_TARGET_BYTES);
      if (attempt) steps.push(attempt);
    }
    expect(steps[0]).toEqual({ quality: 0.7, maxSide: 1600 });
    expect(steps[1]).toEqual({ quality: 0.55, maxSide: 1600 });
    expect(steps[2]).toEqual({ quality: 0.5, maxSide: 1600 });
    expect(steps[3]).toEqual({ quality: 0.7, maxSide: 1200 });
    expect(steps.length).toBeLessThan(20);
    expect(steps[steps.length - 1].maxSide).toBeLessThanOrEqual(800);
  });
});

describe("types de documents", () => {
  it("reconnaît images et PDF", () => {
    expect(documentKind("image/jpeg")).toBe("image");
    expect(documentKind("image/heic")).toBe("image");
    expect(documentKind("application/pdf")).toBe("pdf");
    expect(documentKind("text/plain")).toBeNull();
    expect(extensionFor("application/pdf")).toBe("pdf");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });
});
