import { useLocation, useNavigate } from "react-router";

/** Retour à la page précédente quand on y est venu depuis l'app, sinon vers `fallback`. */
export function useBack(fallback = "/"): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
