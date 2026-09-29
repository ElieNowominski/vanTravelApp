import { useState } from "react";

/**
 * Champ texte lié au store mais écrit seulement à la validation (blur, Entrée) :
 * le brouillon est persisté dans IndexedDB à chaque changement, on évite une écriture par touche.
 * Quand la valeur du store change (autre appareil, autre écran), le brouillon se réaligne.
 */
export function useDraftField(value: string, onCommit: (next: string) => void) {
  const [state, setState] = useState({ base: value, draft: value });
  const draft = state.base === value ? state.draft : value;
  const setDraft = (next: string) => setState({ base: value, draft: next });
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return { draft, setDraft, commit };
}
