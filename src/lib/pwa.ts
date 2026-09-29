/**
 * Contexte d'installation de la PWA, calculé à partir de signaux bruts du navigateur
 * pour rester testable sans DOM.
 */
export type InstallContext =
  /** L'app tourne déjà en mode installé (écran d'accueil). */
  | "installed"
  /** iOS : pas d'événement `beforeinstallprompt`, il faut guider vers « Sur l'écran d'accueil ». */
  | "ios-manual"
  /** Le navigateur a émis `beforeinstallprompt` : on peut ouvrir l'invite native. */
  | "prompt"
  /** Rien à proposer (bureau sans prise en charge, ou événement pas encore reçu). */
  | "unsupported";

export function isIosUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function detectInstallContext(input: {
  userAgent: string;
  standalone: boolean;
  hasPromptEvent: boolean;
}): InstallContext {
  if (input.standalone) return "installed";
  if (input.hasPromptEvent) return "prompt";
  if (isIosUserAgent(input.userAgent)) return "ios-manual";
  return "unsupported";
}

/** Étapes du guide iOS, dans l'ordre affiché. */
export const IOS_INSTALL_STEPS = [
  "Ouvre cette page dans Safari.",
  "Touche le bouton Partager (carré avec une flèche vers le haut).",
  "Choisis « Sur l’écran d’accueil », puis « Ajouter ».",
] as const;
