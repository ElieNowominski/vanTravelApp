import { useEffect, useState } from "react";
import { getDocumentBlob } from "@/lib/document-store";

/** URL d'objet vers le contenu local d'un document, révoquée au démontage. */
export function useDocumentUrl(documentId: string): { url: string | null; missing: boolean } {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({ url: null, missing: false });

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void getDocumentBlob(documentId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState({ url: null, missing: true });
        return;
      }
      url = URL.createObjectURL(blob);
      setState({ url, missing: false });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId]);

  return state;
}
