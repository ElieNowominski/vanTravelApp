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
  "Ouvre cette page dans Safari (pas depuis Chrome ni depuis un lien dans Messages).",
  "Touche le bouton Partager (carré avec une flèche vers le haut).",
  "Choisis « Sur l’écran d’accueil », puis « Ajouter ».",
] as const;

/** Pourquoi installer plutôt que rester dans Safari : iOS purge le stockage d'un site non visité pendant 7 jours. */
export const IOS_INSTALL_NOTE =
  "Une fois installée, l’app garde ses données. Dans Safari seul, iOS peut effacer le stockage d’un site après 7 jours sans visite.";

export type ExportMethod = "share" | "download";

/**
 * Sur iOS, un lien `download` vers un blob est peu fiable (en mode installé il peut ouvrir une page
 * blanche sans retour) : la feuille de partage (Fichiers, AirDrop, Messages) est la voie sûre.
 * Ailleurs, le téléchargement classique reste attendu.
 */
export function chooseExportMethod(input: { userAgent: string; canShareFiles: boolean }): ExportMethod {
  return isIosUserAgent(input.userAgent) && input.canShareFiles ? "share" : "download";
}

/** `window.print()` est sans effet dans une web app iOS installée : il faut passer par Safari. */
export function printNeedsBrowser(input: { userAgent: string; standalone: boolean }): boolean {
  return input.standalone && isIosUserAgent(input.userAgent);
}
