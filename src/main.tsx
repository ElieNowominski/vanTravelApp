import "@fontsource-variable/geist";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app";
import {
  answerUpdateCapabilityProbes,
  bindServiceWorkerUpdater,
  reportNeedRefresh,
  reportOfflineReady,
} from "./services/app-update";

// Mode « prompt » : la nouvelle version s'installe en arrière-plan et attend un toucher sur
// « Mettre à jour » (bannière), pour ne jamais recharger la page pendant une saisie en voyage.
// Contrôle à l'ouverture, puis toutes les heures si l'app reste ouverte.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: reportNeedRefresh,
  onOfflineReady: reportOfflineReady,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    window.setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
});
bindServiceWorkerUpdater(updateSW);
answerUpdateCapabilityProbes();
// Stockage durable quand le navigateur le propose (Chromium) : IndexedDB survit à la pression disque.
// Safari ne l'expose pas ; là, c'est l'installation sur l'écran d'accueil qui protège les données.
void navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
