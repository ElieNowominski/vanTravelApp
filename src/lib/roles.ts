/** Rôle d'un compte dans un voyage (colonne `members.role`, migration 0004). */
export type MemberRole = "owner" | "editor" | "viewer";

/** Rôles qu'un propriétaire peut donner : il ne cède pas le sien. */
export type GrantableRole = Exclude<MemberRole, "owner">;

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "propriétaire",
  editor: "éditeur",
  viewer: "lecteur",
};

/** Valeur inconnue : lecteur, le rôle qui n'envoie rien (le serveur refuserait de toute façon). */
export function parseRole(value: unknown): MemberRole {
  return value === "owner" || value === "editor" ? value : "viewer";
}

/** Peut envoyer itinéraire, entités, dépenses et documents. */
export function canWrite(role: MemberRole | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

/** Propriétaire d'abord, puis éditeurs, puis lecteurs. */
export function roleRank(role: MemberRole): number {
  return role === "owner" ? 0 : role === "editor" ? 1 : 2;
}
