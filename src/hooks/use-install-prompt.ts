import { useCallback, useEffect, useState } from "react";
import { detectInstallContext, type InstallContext } from "@/lib/pwa";

/** Événement Chromium non typé dans lib.dom. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let pendingPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// Capturé au niveau module : l'événement part souvent avant que React ne monte.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingPrompt = event as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    pendingPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

function compute(): InstallContext {
  return detectInstallContext({
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    standalone: isStandalone(),
    hasPromptEvent: pendingPrompt != null,
  });
}

export function useInstallPrompt(): { context: InstallContext; install: () => Promise<boolean> } {
  const [context, setContext] = useState<InstallContext>(() => compute());

  useEffect(() => {
    const refresh = () => setContext(compute());
    listeners.add(refresh);
    const media = window.matchMedia?.("(display-mode: standalone)");
    media?.addEventListener("change", refresh);
    return () => {
      listeners.delete(refresh);
      media?.removeEventListener("change", refresh);
    };
  }, []);

  const install = useCallback(async () => {
    const event = pendingPrompt;
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    pendingPrompt = null;
    setContext(compute());
    return choice.outcome === "accepted";
  }, []);

  return { context, install };
}
