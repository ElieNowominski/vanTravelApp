/**
 * Ouverture de l'app (lot 6) : la première arrivée sur l'écran du voyage dans une session de navigateur
 * passe par l'accueil, sauf pendant un voyage (Voyager d'office). Un rechargement (mise à jour de l'app)
 * garde la session et ne renvoie pas à l'accueil ; relancer la web app installée en ouvre une nouvelle.
 */
const KEY = "vantravel-opened";
let opened = false;

export function isFirstOpening(): boolean {
  if (opened) return false;
  try {
    return window.sessionStorage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
}

export function markOpened(): void {
  opened = true;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    /* stockage de session indisponible : le drapeau du module suffit jusqu'au rechargement */
  }
}
