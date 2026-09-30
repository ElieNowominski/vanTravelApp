import { useState } from "react";
import { Cloud, CloudOff, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useOnline } from "@/hooks/use-online";
import { formatRelativeSync } from "@/lib/sync-status";
import { cn } from "@/lib/utils";
import { checkAccess, type RepoAccess } from "@/services/github-repo";
import { listRemoteTrips, repoRef, syncNow, type RemoteTripEntry } from "@/services/sync";
import { isSyncConfigured, useSyncStore } from "@/store/sync-store";

/**
 * « Compte et synchro » : token à portée fine collé une fois, dépôt privé, voyage choisi dans
 * `trips/index.json`, phrase de chiffrement des codes, état de la dernière passe.
 * Le token ne quitte l'appareil que vers api.github.com, en en-tête.
 */
export function SyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Monté seulement ouvert : le brouillon des champs part des réglages du moment, sans effet.
  if (!open) return null;
  return <SyncDialogBody onClose={onClose} />;
}

function SyncDialogBody({ onClose }: { onClose: () => void }) {
  const settings = useSyncStore((s) => s.settings);
  const setSettings = useSyncStore((s) => s.setSettings);
  const forget = useSyncStore((s) => s.forget);
  const status = useSyncStore((s) => s.status);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const lastError = useSyncStore((s) => s.lastError);
  const lastReport = useSyncStore((s) => s.lastReport);
  const pending = useSyncStore((s) => s.pending);
  const online = useOnline();

  const [owner, setOwner] = useState(settings.owner);
  const [repo, setRepo] = useState(settings.repo);
  const [branch, setBranch] = useState(settings.branch);
  const [token, setToken] = useState(settings.token);
  const [passphrase, setPassphrase] = useState(settings.passphrase);
  const [access, setAccess] = useState<RepoAccess | null>(null);
  const [trips, setTrips] = useState<RemoteTripEntry[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const draft = { ...settings, owner: owner.trim(), repo: repo.trim(), branch: branch.trim(), token: token.trim(), passphrase };
  const dirty = draft.owner !== settings.owner || draft.repo !== settings.repo || draft.branch !== settings.branch || draft.token !== settings.token || passphrase !== settings.passphrase;
  const canTest = draft.owner.length > 0 && draft.repo.length > 0 && draft.token.length > 0;

  const test = async () => {
    setTesting(true);
    setMessage(null);
    setAccess(null);
    setTrips(null);
    try {
      const result = await checkAccess(repoRef(draft));
      setAccess(result);
      if (!result.canPush) {
        setMessage("Le token lit le dépôt mais ne peut pas écrire : donne-lui la permission « Contents : Read and write ».");
      }
      const list = await listRemoteTrips(draft);
      setTrips(list);
      if (list.length === 0) setMessage((m) => m ?? "Aucun voyage dans trips/index.json.");
      setSettings({ owner: draft.owner, repo: draft.repo, branch: draft.branch, token: draft.token, passphrase });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test impossible.");
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    setSettings({ owner: draft.owner, repo: draft.repo, branch: draft.branch, token: draft.token, passphrase });
    setMessage("Réglages enregistrés sur cet appareil.");
  };

  const chooseTrip = (id: string) => {
    setSettings({ owner: draft.owner, repo: draft.repo, branch: draft.branch, token: draft.token, passphrase, tripId: id });
    setMessage(null);
    void syncNow("choix du voyage").then((outcome) => {
      setMessage(outcome.ok ? `Synchronisé : ${outcome.report}.` : outcome.message ?? "Synchronisation impossible.");
    });
  };

  const syncOnce = () => {
    setMessage(null);
    void syncNow("manuel").then((outcome) => {
      if (outcome.ok) setMessage(`Synchronisé : ${outcome.report}.`);
      else if (outcome.reason === "offline") setMessage("Hors ligne : la synchro partira au retour du réseau.");
      else if (outcome.reason === "not-configured") setMessage("Choisis d’abord un voyage.");
      else setMessage(outcome.message ?? "Synchronisation impossible.");
    });
  };

  const configured = isSyncConfigured(settings);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compte et synchro</DialogTitle>
          <DialogDescription>
            Les deux téléphones partagent un même voyage via le dépôt GitHub privé. Le token reste sur cet appareil.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3">
          <StatusLine status={status} online={online} pending={pending} configured={configured} lastSyncAt={lastSyncAt} lastError={lastError} lastReport={lastReport} />
          {configured && (
            <div className="flex flex-wrap gap-2">
              <Button className="h-11" disabled={status === "syncing"} onClick={syncOnce}>
                <RefreshCw className={cn("size-4", status === "syncing" && "animate-spin")} />
                Synchroniser maintenant
              </Button>
              <label className="flex h-11 items-center gap-2 text-sm">
                <Switch checked={settings.autoSync} onCheckedChange={(v) => setSettings({ autoSync: v })} />
                Automatique
              </label>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sync-owner">Compte GitHub</Label>
              <Input id="sync-owner" className="h-11" value={owner} onChange={(e) => setOwner(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sync-repo">Dépôt privé</Label>
              <Input id="sync-repo" className="h-11" value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sync-token">Token à portée fine (ce dépôt, « Contents » en écriture)</Label>
            <Input
              id="sync-token"
              className="h-11"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="github_pat_…"
            />
            <p className="text-xs text-muted-foreground">
              GitHub → Settings → Developer settings → Fine-grained tokens. Un token par personne, un dépôt, permission Contents : Read and write.
            </p>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Branche (optionnel)</summary>
            <Input className="mt-2 h-11" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="branche par défaut" autoCapitalize="none" spellCheck={false} />
          </details>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" disabled={!canTest || testing} onClick={() => void test()}>
              <Cloud className="size-4" />
              {testing ? "Test…" : "Tester et lister les voyages"}
            </Button>
            {dirty && (
              <Button variant="secondary" className="h-11" onClick={save}>
                Enregistrer
              </Button>
            )}
          </div>
          {access && (
            <p className="text-xs text-muted-foreground">
              {access.fullName} · {access.isPrivate ? "privé" : "PUBLIC (attention)"} · {access.canPush ? "lecture et écriture" : "lecture seule"} · branche {access.defaultBranch}
            </p>
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
                        {trip.id}
                        {trip.start ? ` · ${trip.start}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant={active ? "default" : "secondary"} className="h-9" onClick={() => chooseTrip(trip.id)}>
                      {active ? "Actif" : "Utiliser"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {!trips && settings.tripId && <p className="text-xs text-muted-foreground">Voyage synchronisé : {settings.tripId}</p>}
        </section>

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
            Avec une phrase, les codes de portail et de boîte à clés sont chiffrés (AES-GCM) dans le dépôt. Sans la phrase, l’autre
            téléphone voit « code chiffré ». Tout le reste (adresses, références, dépenses) reste lisible dans le dépôt privé.
          </p>
          {passphrase !== settings.passphrase && (
            <Button variant="secondary" className="h-11 w-fit" onClick={save}>
              Enregistrer la phrase
            </Button>
          )}
        </section>

        {message && (
          <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
            {message}
          </p>
        )}

        {(settings.token || settings.tripId) && (
          <ConfirmAction
            variant="ghost"
            size="sm"
            className="h-9 w-fit text-muted-foreground"
            label="Oublier le token sur cet appareil"
            question="Retirer le token et les réglages de synchro de cet appareil ? Les données locales restent."
            confirmLabel="Oublier"
            onConfirm={() => {
              forget();
              setToken("");
              setOwner("");
              setAccess(null);
              setTrips(null);
              setMessage("Token oublié. Pense à le révoquer aussi sur GitHub si l’appareil change de mains.");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
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
  status: "idle" | "syncing" | "offline" | "error";
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
        Pas encore configurée : colle un token, teste, choisis le voyage.
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
