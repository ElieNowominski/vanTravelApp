import { daysBetween } from "@/lib/voyager";
import { PROFILE_PRESETS, profileFromPreset } from "@/lib/profiles";
import { slugify } from "@/lib/trip-config";
import type { PlaceInput, ProfilePresetId, TravelMode, TravelProfile, TripConfig, TripMilestone } from "@/lib/types";

/**
 * Écran de création (lot 6) : un seul choix « Déplacement » donne le mode des tronçons et le profil.
 * Les préréglages de véhicule portent déjà leur mode ; train, vélo et marche gardent le profil van en
 * arrière-plan (il ne sert qu'aux tronçons routiers que la personne choisirait ensuite).
 */
export type TravelChoice = ProfilePresetId | "train" | "velo" | "marche";

export const TRAVEL_CHOICES: Array<{ id: TravelChoice; label: string }> = [
  { id: "van", label: "Van" },
  { id: "camping-car", label: "Camping-car" },
  { id: "voiture", label: "Voiture" },
  { id: "moto", label: "Moto" },
  { id: "train", label: "Train" },
  { id: "velo", label: "Vélo" },
  { id: "marche", label: "À pied" },
];

export function travelChoice(choice: TravelChoice): { defaultMode: TravelMode; profile: TravelProfile } {
  if (choice in PROFILE_PRESETS) {
    const profile = profileFromPreset(choice as ProfilePresetId);
    return { defaultMode: profile.mode, profile };
  }
  return { defaultMode: choice as TravelMode, profile: profileFromPreset("van") };
}

export type NewTripInput = {
  name: string;
  startDate: string;
  endDate: string;
  start: PlaceInput | null;
  /** `null` avec `roundTrip` : l'arrivée est le départ. */
  end: PlaceInput | null;
  roundTrip: boolean;
  choice: TravelChoice;
};

/** Premier défaut bloquant de la saisie, ou `null` si le voyage peut être créé. */
export function newTripError(input: NewTripInput): string | null {
  if (!input.name.trim()) return "Donne un nom au voyage.";
  if (!input.startDate || !input.endDate) return "Renseigne les deux dates.";
  if (input.endDate < input.startDate) return "La fin précède le début.";
  if (!input.start) return "Choisis un point de départ.";
  if (!input.roundTrip && !input.end) return "Choisis le point d’arrivée, ou coche le retour au départ.";
  return null;
}

/** « 10 jours, 9 nuits » ; « 1 jour » pour un aller-retour dans la journée ; vide sans dates valides. */
export function durationLabel(startDate: string, endDate: string): string {
  if (!startDate || !endDate || endDate < startDate) return "";
  const nights = daysBetween(startDate, endDate);
  const days = nights + 1;
  const dayText = `${days} jour${days > 1 ? "s" : ""}`;
  return nights === 0 ? dayText : `${dayText}, ${nights} nuit${nights > 1 ? "s" : ""}`;
}

function milestone(place: PlaceInput, date: string): TripMilestone {
  return {
    placeId: place.placeId,
    date,
    name: place.name,
    lng: place.lng,
    lat: place.lat,
    ...(place.area ? { area: place.area } : {}),
  };
}

/** Le voyage tel que l'écran de création le pose ; lève si la saisie est incomplète. */
export function buildNewTripConfig(input: NewTripInput): TripConfig {
  const error = newTripError(input);
  if (error) throw new Error(error);
  const name = input.name.trim();
  const start = input.start as PlaceInput;
  const end = input.roundTrip ? start : (input.end as PlaceInput);
  const { defaultMode, profile } = travelChoice(input.choice);
  return {
    id: `trip-${slugify(name)}-${input.startDate}`,
    schemaVersion: 2,
    name,
    defaultMode,
    start: milestone(start, input.startDate),
    end: milestone(end, input.endDate),
    profile,
    stays: [],
    plan: { days: [] },
  };
}
