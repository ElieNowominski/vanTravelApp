import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CompareApp } from "@/components/compare-app";
import { HomeScreen } from "@/components/home-screen";
import { NewTripScreen } from "@/components/new-trip-screen";
import { RoadbookPage } from "@/components/roadbook/roadbook-page";
import { TripApp } from "@/components/trip-app";
import { DocumentsPage } from "@/components/voyager/documents-page";
import { ExpensesPage } from "@/components/voyager/expenses-page";
import { NewExpensePage } from "@/components/voyager/new-expense-page";
import { StopPage } from "@/components/voyager/stop-page";
import { useKeyboardScrollReset } from "@/hooks/use-keyboard-scroll-reset";
import { useApplyTheme } from "@/hooks/use-theme";

/**
 * Le basename suit le préfixe de déploiement, barre finale comprise (`/vanTravelApp/` sur GitHub Pages) :
 * ainsi le lien vers l'accueil produit `/vanTravelApp/`, dans le `scope` du manifeste. Sans la barre,
 * `/vanTravelApp` sort du scope et une web app installée (iOS, Android) peut afficher sa barre de
 * navigateur ou ouvrir Safari.
 */
const basename = import.meta.env.BASE_URL;

export function App() {
  useKeyboardScrollReset();
  useApplyTheme();
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<TripApp />} />
        <Route path="/voyages" element={<HomeScreen />} />
        <Route path="/voyages/nouveau" element={<NewTripScreen />} />
        <Route path="/comparer" element={<CompareApp />} />
        <Route path="/roadbook" element={<RoadbookPage />} />
        <Route path="/etape/:stopId" element={<StopPage />} />
        <Route path="/depenses" element={<ExpensesPage />} />
        <Route path="/depenses/nouvelle" element={<NewExpensePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
