/**
 * Profil local : qui écrit sur cet appareil. Renseigne `updatedBy` et `paidBy`.
 * Stocké dans IndexedDB (`src/store/profile-store.ts`), jamais synchronisé tel quel.
 */
export type Profile = {
  name: string;
  color: string;
  /** Prénom de l'autre personne du voyage, pour la saisie « qui a payé » et la répartition. */
  partnerName: string;
};

export const PROFILE_COLORS = [
  "#0f766e",
  "#c2410c",
  "#4338ca",
  "#be185d",
  "#15803d",
  "#b45309",
] as const;

export function defaultProfile(): Profile {
  return { name: "", color: PROFILE_COLORS[0], partnerName: "" };
}

export function isProfileComplete(profile: Profile): boolean {
  return profile.name.trim().length > 0;
}

/** Nom à écrire dans `updatedBy` : le prénom, ou un repli neutre tant que le profil n'est pas rempli. */
export function authorName(profile: Pick<Profile, "name">): string {
  return profile.name.trim() || "moi";
}

/** Les personnes du voyage, sans doublon ni vide, profil local en premier. */
export function tripPeople(profile: Profile, extra: string[] = []): string[] {
  const out: string[] = [];
  for (const raw of [profile.name, profile.partnerName, ...extra]) {
    const name = raw.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
