import "@fontsource-variable/geist";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app";

// autoUpdate : la nouvelle version s'installe et la page se recharge toute seule.
// En plus du contrôle à l'ouverture, on revérifie toutes les heures si l'app reste ouverte.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    window.setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
