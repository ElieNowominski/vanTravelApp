import { useEffect, useState } from "react";
import { Cloud, CloudOff, Download, KeyRound, LogIn, LogOut, RefreshCw, TriangleAlert, Upload, UserPlus, Users } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useOnline } from "@/hooks/use-online";
import type { ItineraryForce } from "@/lib/sync-model";
import { formatRelativeSync } from "@/lib/sync-status";
import { cn } from "@/lib/utils";
import { sendPasswordReset, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/supabase";
import { addMemberByEmail, createTrip, listMemberTrips, listMembers, removeMember, type Member, type MemberTrip } from "@/services/supabase-sync";
import { previewItinerarySync, syncNow } from "@/services/sync";
import { isSyncConfigured, useAccountStore, type SyncStatus } from "@/store/account-store";
import { useTripStore } from "@/store/trip-store";

/**
 * « Compte et synchro » : connexion Google ou e-mail, voyages du compte, membres, état de la dernière
 * passe, phrase de chiffrement des codes. Les données locales restent lisibles sans connexion.
 */
export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Monté seulement ouvert : les champs partent des réglages du moment, sans effet.
  if (!open) return null;
  return <AccountDialogBody onClose={onClose} />;
}

function AccountDialogBody({ onClose }: { onClose: () => void }) {
  const user = useAccountStore((s) => s.user);
  const settings = useAccountStore((s) => s.settings);
  const setSettings = useAccountStore((s) => s.setSettings);
  const status = useAccountStore((s) => s.status);
  const lastSyncAt = useAccountStore((s) => s.lastSyncAt);
  const lastError = useAccountStore((s) => s.lastError);
  const lastReport = useAccountStore((s) => s.lastReport);
  const pending = useAccountStore((s) => s.pending);
  const localConfig = useTripStore((s) => s.config);
  const online = useOnline();
  const ready = isSupabaseConfigured();
  const configured = isSyncConfigured({ user, settings });

  const [trips, setTrips] = useState<MemberTrip[] | null>(null);
  const [memberList, setMemberList] = useState<{ tripId: string; list: Member[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState(settings.passphrase);
  const [inviteEmail, setInviteEmail] = useState("");
  const [refresh, setRefresh] = useState(0);

  // Les voyages du compte, dès qu'on est connecté et en ligne.
  useEffect(() => {
    if (!user || !online) return;
    let alive = true;
    listMemberTrips()
      .then((list) => alive && setTrips(list))
      .catch((error: unknown) => alive && setMessage(error instanceof Error ? error.message : "Liste des voyages impossible."));
    return () => {
      alive = false;
    };
  }, [user, online, refresh]);

  // Les membres du voyage actif (la liste d'un autre voyage ne s'affiche jamais : clé par identifiant).
  useEffect(() => {
    const tripId = settings.tripId;
    if (!user || !online || !tripId) return;
    let alive = true;
    listMembers(tripId)
      .then((list) => alive && setMemberList({ tripId, list }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user, online, settings.tripId, refresh]);
  const members = memberList && memberList.tripId === settings.tripId ? memberList.list : null;

  // Avant d'agir : ce que la passe ferait de l'itinéraire (un seul appel, `updated_at` seul).
  useEffect(() => {
    if (!configured || !online || status === "syncing") return;
    let alive = true;
    previewItinerarySync()
      .then((text) => alive && setPreview(text || null))
      .catch(() => alive && setPreview(null));
    return () => {
      alive = false;
    };
  }, [configured, online, status, lastSyncAt]);

  const activeTrip = trips?.find((t) => t.id === settings.tripId) ?? null;
  const isOwner = !!user && !!activeTrip && activeTrip.ownerId === user.id;
  const localTripMissing = !!localConfig && !!trips && !trips.some((t) => t.id === localConfig.id);

  const report = (outcome: Awaited<ReturnType<typeof syncNow>>) => {
    if (outcome.ok) setMessage(`Synchronisé : ${outcome.report}.`);
    else if (outcome.reason === "offline") setMessage("Hors ligne : la synchro partira au retour du réseau.");
    else if (outcome.reason === "not-configured") setMessage("Choisis d’abord un voyage.");
    else setMessage(outcome.message ?? "Synchronisation impossible.");
  };

  const syncWith = (reason: string, itinerary?: ItineraryForce) => {
    setMessage(null);
    void syncNow(reason, { itinerary }).then(report);
  };

  const chooseTrip = (id: string) => {
    setSettings({ tripId: id });
    setMessage(null);
    void syncNow("choix du voyage").then(report);
  };

  const publishLocalTrip = async () => {
    if (!localConfig) return;
    setBusy(true);
    setMessage(null);
    try {
      const id = await createTrip(localConfig);
      setRefresh((n) => n + 1);
      setSettings({ tripId: id });
      const outcome = await syncNow("voyage créé sur le compte");
      report(outcome);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!settings.tripId || !inviteEmail.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await addMemberByEmail(settings.tripId, inviteEmail);
      setInviteEmail("");
      setRefresh((n) => n + 1);
      setMessage("Personne ajoutée : elle verra le voyage à sa prochaine connexion.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (member: Member) => {
    if (!settings.tripId) return;
    try {
      await removeMember(settings.tripId, member.userId);
      setRefresh((n) => n + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Retrait impossible.");
    }
  };

  const savePassphrase = () => {
    setSettings({ passphrase });
    setMessage("Phrase enregistrée sur cet appareil. Les codes seront chiffrés à la prochaine synchro.");
  };

  const logout = async () => {
    await signOut();
    setTrips(null);
    setMemberList(null);
    setMessage("Déconnecté. Les données de cet appareil restent.");
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compte et synchro</DialogTitle>
          <DialogDescription>
            Les téléphones partagent un même voyage via ton compte. Sans réseau, tout reste lisible ici et part plus tard.
          </DialogDescription>
        </DialogHeader>

        {!ready && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            Synchro indisponible dans cette version (variables Supabase absentes du build). L’app reste utilisable en local, avec la sauvegarde par fichier.
          </p>
        )}

        {ready && !user && <AuthSection online={online} onMessage={setMessage} />}

        {user && (
          <>
            <section className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{user.displayName || "Connecté"}</p>
                {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
              </div>
              <ConfirmAction
                variant="ghost"
                size="sm"
                className="h-9 shrink-0 text-muted-foreground"
                icon={<LogOut className="size-4" />}
                label="Se déconnecter"
                question="Se déconnecter sur cet appareil ? Les données locales restent, la synchro s’arrête jusqu’à la prochaine connexion."
                confirmLabel="Se déconnecter"
                onConfirm={() => void logout()}
              />
            </section>

            <section className="flex flex-col gap-3 border-t pt-3">
              <StatusLine status={status} online={online} pending={pending} configured={configured} lastSyncAt={lastSyncAt} lastError={lastError} lastReport={lastReport} />
              {configured && (
                <>
                  {preview && <p className="text-xs text-muted-foreground">{preview}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button className="h-11" disabled={status === "syncing"} onClick={() => syncWith("manuel")}>
                      <RefreshCw className={cn("size-4", status === "syncing" && "animate-spin")} />
                      Synchroniser
                    </Button>
                    <label className="flex h-11 items-center gap-2 text-sm">
                      <Switch checked={settings.autoSync} onCheckedChange={(v) => setSettings({ autoSync: v })} />
                      Automatique
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ConfirmAction
                      variant="outline"
                      size="sm"
                      className="h-11"
                      disabled={status === "syncing"}
                      icon={<Download className="size-4" />}
                      label="Recevoir l’itinéraire du compte"
                      question="Remplacer l’itinéraire de cet appareil par celui du compte ? Réservations, notes et dépenses sont conservées."
                      confirmLabel="Recevoir"
                      onConfirm={() => syncWith("réception demandée", "take-remote")}
                    />
                    <ConfirmAction
                      variant="outline"
                      size="sm"
                      className="h-11"
                      disabled={status === "syncing"}
                      icon={<Upload className="size-4" />}
                      label="Envoyer mon itinéraire"
                      question="Remplacer l’itinéraire du compte par celui de cet appareil ? L’autre téléphone le recevra à sa prochaine synchro."
                      confirmLabel="Envoyer"
                      onConfirm={() => syncWith("envoi demandé", "push-local")}
                    />
                  </div>
                </>
              )}
            </section>

            <section className="flex flex-col gap-2 border-t pt-3">
              <h3 className="text-sm font-medium">Voyages du compte</h3>
              {!online && <p className="text-xs text-muted-foreground">Hors ligne : liste indisponible. {settings.tripId ? `Voyage synchronisé : ${settings.tripId}.` : ""}</p>}
              {online && trips === null && <p className="text-xs text-muted-foreground">Chargement…</p>}
              {trips && trips.length === 0 && !localConfig && (
                <p className="text-xs text-muted-foreground">Aucun voyage encore. Crée-en un depuis l’écran de démarrage, puis reviens ici pour le mettre sur le compte.</p>
              )}
              {trips && trips.length > 0 && (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {trips.map((trip) => {
                    const active = settings.tripId === trip.id;
                    return (
                      <li key={trip.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{trip.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {trip.id} · {trip.role === "owner" ? "propriétaire" : "membre"}
                          </p>
                        </div>
                        <Button size="sm" variant={active ? "default" : "secondary"} className="h-9" disabled={status === "syncing"} onClick={() => chooseTrip(trip.id)}>
                          {active ? "Actif" : "Utiliser"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {localTripMissing && localConfig && (
                <ConfirmAction
                  variant="outline"
                  size="sm"
                  className="h-11 w-fit"
                  disabled={busy || !online}
                  icon={<Cloud className="size-4" />}
                  label={`Mettre « ${localConfig.name} » sur le compte`}
                  question="Créer ce voyage sur ton compte, avec son itinéraire, ses réservations et ses dépenses ? Tu pourras ensuite y ajouter l’autre personne."
                  confirmLabel="Créer"
                  onConfirm={() => void publishLocalTrip()}
                />
              )}
            </section>

            {settings.tripId && online && (
              <section className="flex flex-col gap-2 border-t pt-3">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <Users className="size-3.5" />
                  Membres du voyage
                </h3>
                {members === null && <p className="text-xs text-muted-foreground">Chargement…</p>}
                {members && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {members.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {m.displayName}
                          {m.userId === user.id ? " (toi)" : ""}
                          <span className="text-xs text-muted-foreground"> · {m.role === "owner" ? "propriétaire" : "membre"}</span>
                        </span>
                        {isOwner && m.role !== "owner" && (
                          <ConfirmAction
                            variant="ghost"
                            size="sm"
                            className="h-9 text-muted-foreground"
                            label="Retirer"
                            question={`Retirer ${m.displayName} du voyage ? Ses données locales restent sur son téléphone.`}
                            confirmLabel="Retirer"
                            onConfirm={() => void revoke(m)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {isOwner && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="invite-email">Ajouter une personne par e-mail</Label>
                    <div className="flex gap-2">
                      <Input
                        id="invite-email"
                        className="h-11"
                        type="email"
                        inputMode="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="elle@exemple.fr"
                      />
                      <Button variant="secondary" className="h-11 shrink-0" disabled={busy || !inviteEmail.trim()} onClick={() => void invite()}>
                        <UserPlus className="size-4" />
                        Ajouter
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">La personne doit d’abord s’être créé un compte dans l’app avec cet e-mail.</p>
                  </div>
                )}
              </section>
            )}

            <section className="flex flex-col gap-1.5 border-t pt-3">
              <Label htmlFor="sync-passphrase" className="flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                Phrase de chiffrement des codes d’accès (optionnel)
              </Label>
              <Input
                id="sync-passphrase"
                className="h-11"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                placeholder="la même sur les deux téléphones"
              />
              <p className="text-xs text-muted-foreground">
                Avec une phrase, les codes de portail et de boîte à clés sont chiffrés (AES-GCM) avant d’être envoyés. Sans la phrase, l’autre
                téléphone voit « code chiffré ». Tout le reste (adresses, références, dépenses) reste lisible par les membres du voyage.
              </p>
              {passphrase !== settings.passphrase && (
                <Button variant="secondary" className="h-11 w-fit" onClick={savePassphrase}>
                  Enregistrer la phrase
                </Button>
              )}
            </section>
          </>
        )}

        {message && (
          <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuthSection({ online, onMessage }: { online: boolean; onMessage: (text: string | null) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    onMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Connexion Google impossible.");
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) return onMessage("E-mail et mot de passe sont requis.");
    setBusy(true);
    onMessage(null);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        onMessage("Connecté.");
      } else {
        if (!name.trim()) return onMessage("Indique ton prénom.");
        const { confirm } = await signUpWithEmail(email, password, name);
        onMessage(confirm ? "Compte créé : ouvre le lien reçu par e-mail, puis connecte-toi ici." : "Compte créé et connecté.");
        setMode("signin");
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) return onMessage("Indique ton e-mail pour recevoir le lien.");
    try {
      await sendPasswordReset(email);
      onMessage("Lien de réinitialisation envoyé par e-mail.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Envoi impossible.");
    }
  };

  return (
    <section className="flex flex-col gap-3">
      {!online && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudOff className="size-4" />
          Hors ligne : la connexion attendra le réseau.
        </p>
      )}
      <Button className="h-11" disabled={busy || !online} onClick={() => void google()}>
        <LogIn className="size-4" />
        Continuer avec Google
      </Button>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou par e-mail
        <span className="h-px flex-1 bg-border" />
      </div>
      {mode === "signup" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-name">Prénom</Label>
          <Input id="auth-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth-email">E-mail</Label>
        <Input
          id="auth-email"
          className="h-11"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auth-password">Mot de passe</Label>
        <Input
          id="auth-password"
          className="h-11"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="h-11" disabled={busy || !online} onClick={() => void submit()}>
          {mode === "signin" ? "Se connecter" : "Créer le compte"}
        </Button>
        <Button variant="ghost" className="h-11" disabled={busy} onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Créer un compte" : "J’ai déjà un compte"}
        </Button>
        {mode === "signin" && (
          <Button variant="ghost" className="h-11 text-muted-foreground" disabled={busy || !online} onClick={() => void reset()}>
            Mot de passe oublié
          </Button>
        )}
      </div>
    </section>
  );
}

function StatusLine({
  status,
  online,
  pending,
  configured,
  lastSyncAt,
  lastError,
  lastReport,
}: {
  status: SyncStatus;
  online: boolean;
  pending: boolean;
  configured: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  lastReport: string | null;
}) {
  if (!configured) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CloudOff className="size-4" />
        Aucun voyage choisi : « Utiliser » un voyage ci-dessous, ou mets celui de cet appareil sur le compte.
      </p>
    );
  }
  const icon =
    status === "syncing" ? (
      <RefreshCw className="size-4 animate-spin text-primary" />
    ) : status === "error" ? (
      <TriangleAlert className="size-4 text-destructive" />
    ) : !online || status === "offline" ? (
      <CloudOff className="size-4 text-muted-foreground" />
    ) : (
      <Cloud className="size-4 text-primary" />
    );
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <p className="flex items-center gap-2">
        {icon}
        <span>
          {status === "syncing"
            ? "Synchronisation…"
            : !online
              ? pending
                ? "Hors ligne, modifications en attente"
                : "Hors ligne, à jour"
              : pending
                ? "Modifications en attente d’envoi"
                : `Dernière synchro : ${formatRelativeSync(lastSyncAt)}`}
        </span>
      </p>
      {lastError && <p className="text-xs text-destructive">{lastError}</p>}
      {!lastError && lastReport && <p className="text-xs text-muted-foreground">{lastReport}</p>}
    </div>
  );
}
