import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CompareApp } from "@/components/compare-app";
import { RoadbookPage } from "@/components/roadbook/roadbook-page";
import { TripApp } from "@/components/trip-app";
import { useKeyboardScrollReset } from "@/hooks/use-keyboard-scroll-reset";

/**
 * Le basename suit le préfixe de déploiement, barre finale comprise (`/vanTravelApp/` sur GitHub Pages) :
 * ainsi le lien vers l'accueil produit `/vanTravelApp/`, dans le `scope` du manifeste. Sans la barre,
 * `/vanTravelApp` sort du scope et une web app installée (iOS, Android) peut afficher sa barre de
 * navigateur ou ouvrir Safari.
 */
const basename = import.meta.env.BASE_URL;

export function App() {
  useKeyboardScrollReset();
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<TripApp />} />
        <Route path="/comparer" element={<CompareApp />} />
        <Route path="/roadbook" element={<RoadbookPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
