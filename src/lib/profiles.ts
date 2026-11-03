import type { ProfilePresetId, TravelMode, TravelProfile, Vehicle } from "@/lib/types";

/**
 * Préréglages standard (Q13 du cadrage) : copiés dans le voyage à la création, puis ajustables.
 * Les facteurs multiplient le temps routier brut d'OSRM (profil voiture) ; le van reprend les valeurs de la v1.
 */
export const PROFILE_PRESETS: Record<ProfilePresetId, TravelProfile> = {
  van: {
    presetId: "van",
    mode: "van",
    name: "Van aménagé",
    selfContained: true,
    timeFactor: 1.3,
    windingFactor: 1.15,
    maxComfortableDriveHours: 4,
  },
  "camping-car": {
    presetId: "camping-car",
    mode: "van",
    name: "Camping-car",
    selfContained: true,
    lengthM: 7,
    heightM: 3,
    timeFactor: 1.4,
    windingFactor: 1.25,
    maxComfortableDriveHours: 4,
  },
  voiture: {
    presetId: "voiture",
    mode: "voiture",
    name: "Voiture",
    selfContained: false,
    timeFactor: 1,
    windingFactor: 1.05,
    maxComfortableDriveHours: 6,
  },
  moto: {
    presetId: "moto",
    mode: "moto",
    name: "Moto",
    selfContained: false,
    timeFactor: 1.05,
    windingFactor: 1.1,
    maxComfortableDriveHours: 5,
  },
};

export const PROFILE_PRESET_IDS = Object.keys(PROFILE_PRESETS) as ProfilePresetId[];

export const DEFAULT_PROFILE_ID: ProfilePresetId = "van";

/** Profil quand le voyage n'en précise pas (ancien circuit, voyage reconstruit). */
export const DEFAULT_PROFILE: TravelProfile = PROFILE_PRESETS[DEFAULT_PROFILE_ID];

export const TRAVEL_MODES: TravelMode[] = ["van", "voiture", "moto", "train", "ferry", "velo", "marche"];

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  van: "Van",
  voiture: "Voiture",
  moto: "Moto",
  train: "Train",
  ferry: "Ferry",
  velo: "Vélo",
  marche: "Marche",
};

/** Modes calculés par le routage routier ; les autres sont saisis à la main pour l'instant (lot 4). */
export function isRoadMode(mode: TravelMode): boolean {
  return mode === "van" || mode === "voiture" || mode === "moto";
}

export function isTravelMode(value: unknown): value is TravelMode {
  return typeof value === "string" && (TRAVEL_MODES as string[]).includes(value);
}

export function profileFromPreset(id: ProfilePresetId = DEFAULT_PROFILE_ID): TravelProfile {
  return structuredClone(PROFILE_PRESETS[id] ?? PROFILE_PRESETS[DEFAULT_PROFILE_ID]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lit un profil v2 ou un véhicule v1 (`vehicle`) et complète depuis le préréglage.
 * Un véhicule v1 devient un profil « van » : la v1 ne connaissait que le van.
 */
export function normalizeProfile(value: unknown): TravelProfile {
  const raw: Partial<TravelProfile & Vehicle> = isRecord(value) ? value : {};
  const presetId = (PROFILE_PRESET_IDS as string[]).includes(raw.presetId as string)
    ? (raw.presetId as ProfilePresetId)
    : DEFAULT_PROFILE_ID;
  const base = PROFILE_PRESETS[presetId];
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);
  const optNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
  return {
    presetId,
    mode: isTravelMode(raw.mode) && isRoadMode(raw.mode) ? raw.mode : base.mode,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : base.name,
    selfContained: typeof raw.selfContained === "boolean" ? raw.selfContained : base.selfContained,
    lengthM: optNum(raw.lengthM) ?? base.lengthM,
    widthM: optNum(raw.widthM) ?? base.widthM,
    heightM: optNum(raw.heightM) ?? base.heightM,
    timeFactor: num(raw.timeFactor, base.timeFactor),
    windingFactor: num(raw.windingFactor, base.windingFactor),
    maxComfortableDriveHours: num(raw.maxComfortableDriveHours, base.maxComfortableDriveHours),
    notes: typeof raw.notes === "string" && raw.notes ? raw.notes : undefined,
    restrictedRoads: Array.isArray(raw.restrictedRoads)
      ? (raw.restrictedRoads.filter(isRecord) as TravelProfile["restrictedRoads"])
      : undefined,
  };
}
