import { useEffect } from "react";
import { isIosUserAgent } from "@/lib/pwa";

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/**
 * iOS Safari : à l'ouverture du clavier, la page (pourtant `overflow: hidden`) est décalée pour
 * montrer le champ, et le décalage reste parfois après la fermeture : en-tête coupé, barre du bas
 * hors écran. On remet la page à zéro dès qu'aucun champ n'a le focus.
 */
export function useKeyboardScrollReset(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !isIosUserAgent(navigator.userAgent)) return;
    const reset = () => {
      window.requestAnimationFrame(() => {
        if (isEditable(document.activeElement)) return;
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      });
    };
    document.addEventListener("focusout", reset);
    window.visualViewport?.addEventListener("resize", reset);
    return () => {
      document.removeEventListener("focusout", reset);
      window.visualViewport?.removeEventListener("resize", reset);
    };
  }, []);
}
