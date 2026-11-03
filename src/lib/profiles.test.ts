import { describe, expect, it } from "vitest";
import { PROFILE_PRESETS, PROFILE_PRESET_IDS, isRoadMode, normalizeProfile, profileFromPreset } from "@/lib/profiles";

describe("préréglages de profil", () => {
  it("chaque préréglage porte son identifiant et un mode routier", () => {
    for (const id of PROFILE_PRESET_IDS) {
      expect(PROFILE_PRESETS[id].presetId).toBe(id);
      expect(isRoadMode(PROFILE_PRESETS[id].mode)).toBe(true);
      expect(PROFILE_PRESETS[id].timeFactor).toBeGreaterThan(0);
    }
  });

  it("profileFromPreset rend une copie : modifier le voyage ne touche pas le préréglage", () => {
    const copy = profileFromPreset("camping-car");
    copy.timeFactor = 9;
    expect(PROFILE_PRESETS["camping-car"].timeFactor).toBe(1.4);
  });
});

describe("normalizeProfile", () => {
  it("lit un véhicule v1 comme un profil « van » et garde ses valeurs", () => {
    const profile = normalizeProfile({
      name: "Van 3 places",
      selfContained: true,
      lengthM: 5.4,
      timeFactor: 1.35,
      windingFactor: 1.2,
      maxComfortableDriveHours: 3.5,
      restrictedRoads: [{ id: "r", name: "Route de démonstration", note: "interdite" }],
    });
    expect(profile).toMatchObject({ presetId: "van", mode: "van", name: "Van 3 places", lengthM: 5.4, timeFactor: 1.35, maxComfortableDriveHours: 3.5 });
    expect(profile.restrictedRoads).toHaveLength(1);
  });

  it("complète depuis le préréglage et refuse un mode non routier", () => {
    const profile = normalizeProfile({ presetId: "voiture", mode: "train", timeFactor: -1 });
    expect(profile).toMatchObject({ presetId: "voiture", mode: "voiture", name: "Voiture", timeFactor: 1, selfContained: false });
  });

  it("donne le van par défaut sans rien", () => {
    expect(normalizeProfile(undefined)).toEqual(PROFILE_PRESETS.van);
  });
});
