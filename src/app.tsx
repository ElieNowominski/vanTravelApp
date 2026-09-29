import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CompareApp } from "@/components/compare-app";
import { TripApp } from "@/components/trip-app";

/** Le basename suit le préfixe de déploiement (`/vanTravelApp` sur GitHub Pages). */
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

export function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<TripApp />} />
        <Route path="/comparer" element={<CompareApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
