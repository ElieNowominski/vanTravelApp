import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabase, requireSupabase, toSyncError } from "@/services/supabase";
import { ensureAccountHydrated, useAccountStore, type AccountUser } from "@/store/account-store";
import { useProfileStore } from "@/store/profile-store";

/**
 * Session Supabase : connexion Google ou e-mail, écoute des changements, identité recopiée dans le store
 * de compte pour l'affichage hors ligne. Rien ici ne bloque l'affichage des données locales.
 */

/** URL de retour après OAuth ou confirmation d'e-mail : la racine de l'app, dans le scope de la PWA. */
export function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

export function displayNameOf(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const candidates = [meta?.full_name, meta?.name, meta?.display_name, user.email?.split("@")[0]];
  const found = candidates.find((v): v is string => typeof v === "string" && v.trim().length > 0);
  return found?.trim() ?? "";
}

function toAccountUser(user: User): AccountUser {
  return { id: user.id, email: user.email ?? null, displayName: displayNameOf(user) };
}

function applySession(session: Session | null, event: string): void {
  const store = useAccountStore.getState();
  if (!session) {
    // Hors ligne, supabase-js peut échouer à rafraîchir le jeton et ne rien renvoyer : on garde
    // l'identité mémorisée pour l'affichage. Une vraie déconnexion, ou l'absence de session en ligne, l'efface.
    const online = typeof navigator === "undefined" || navigator.onLine;
    if (event === "SIGNED_OUT" || online) store.setUser(null);
    return;
  }
  const user = toAccountUser(session.user);
  store.setUser(user);
  // Premier lancement : le prénom du profil local (celui qui signe les écritures) part du compte.
  const profile = useProfileStore.getState();
  if (!profile.profile.name.trim() && user.displayName) profile.setProfile({ name: user.displayName.split(/\s+/)[0] });
}

/** Le profil (prénom affiché aux co-membres) existe après l'inscription, trigger SQL ou pas. */
async function ensureProfile(client: SupabaseClient, session: Session): Promise<void> {
  try {
    await client.from("profiles").upsert({ id: session.user.id, display_name: displayNameOf(session.user) }, { onConflict: "id", ignoreDuplicates: true });
  } catch {
    /* hors ligne ou policy : sans conséquence, retenté à la prochaine connexion */
  }
}

/** Après un retour OAuth (`?code=`), l'URL redevient propre pour rester dans le scope de la PWA. */
function cleanOAuthUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("code") && !url.hash.includes("access_token")) return;
  url.searchParams.delete("code");
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.toString());
}

let listening = false;

/** À appeler une fois au démarrage. Sans Supabase configuré, ne fait rien. */
export function startAuthListener(): () => void {
  const client = getSupabase();
  if (!client || listening) return () => undefined;
  listening = true;
  void ensureAccountHydrated().then(async () => {
    try {
      const { data } = await client.auth.getSession();
      applySession(data.session, "INITIAL");
    } catch {
      /* stockage inaccessible : l'identité mémorisée reste */
    }
  });
  const { data } = client.auth.onAuthStateChange((event, session) => {
    void ensureAccountHydrated().then(() => applySession(session, event));
    if (event === "SIGNED_IN" && session) {
      // Jamais d'appel Supabase dans le callback lui-même (interblocage documenté) : on diffère.
      window.setTimeout(() => void ensureProfile(client, session), 0);
      cleanOAuthUrl();
    }
  });
  return () => {
    data.subscription.unsubscribe();
    listening = false;
  };
}

export async function signInWithGoogle(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: appUrl() } });
  if (error) throw toSyncError(error, "Connexion Google");
}

function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "E-mail non confirmé : ouvre le lien reçu par e-mail, puis reconnecte-toi.";
  if (/already registered|already been registered/i.test(message)) return "Un compte existe déjà avec cet e-mail : connecte-toi.";
  if (/password should be at least|weak password/i.test(message)) return "Mot de passe trop court (6 caractères minimum).";
  if (/rate limit|too many requests/i.test(message)) return "Trop d’essais : attends une minute.";
  if (/unsupported provider|provider is not enabled/i.test(message)) return "Ce mode de connexion n’est pas activé sur le projet Supabase.";
  return message;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authMessage(error.message));
}

/** `confirm` : l'inscription attend un clic dans l'e-mail de confirmation avant la première connexion. */
export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<{ confirm: boolean }> {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: displayName.trim() }, emailRedirectTo: appUrl() },
  });
  if (error) throw new Error(authMessage(error.message));
  return { confirm: !data.session };
}

export async function sendPasswordReset(email: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
  if (error) throw new Error(authMessage(error.message));
}

/** Déconnexion de cet appareil seulement ; les données locales (IndexedDB) restent. */
export async function signOut(): Promise<void> {
  const client = getSupabase();
  try {
    await client?.auth.signOut({ scope: "local" });
  } catch {
    /* hors ligne : la session locale est quand même effacée ci-dessous */
  }
  useAccountStore.getState().forget();
}
