/**
 * Client minimal de l'API Contents de GitHub, depuis le navigateur.
 * Lecture avec `sha`, écriture avec `sha` (verrou optimiste) : un 409 signale qu'un autre appareil
 * a écrit entre-temps, l'appelant relit, fusionne et réessaie.
 *
 * Le token (portée fine : un dépôt, permission « Contents » en écriture) ne transite qu'en en-tête,
 * jamais dans une URL ni dans le code.
 */
export type RepoRef = {
  owner: string;
  repo: string;
  /** Branche cible ; vide = branche par défaut du dépôt. */
  branch?: string;
  token: string;
};

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path?: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
  /** Écriture refusée parce que le `sha` fourni n'est plus celui du fichier. */
  get isConflict(): boolean {
    return this.status === 409 || this.status === 422;
  }
}

export type RemoteFile = { sha: string; size: number; bytes: Uint8Array };

const API = "https://api.github.com";
const TIMEOUT_MS = 20_000;

function headers(ref: RepoRef, accept = "application/vnd.github+json"): HeadersInit {
  return {
    Authorization: `Bearer ${ref.token}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentsUrl(ref: RepoRef, path: string, withRef = true): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`${API}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents/${encoded}`);
  if (withRef && ref.branch) url.searchParams.set("ref", ref.branch);
  return url.toString();
}

async function request(url: string, init: RequestInit & { path?: string }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new GitHubError(error instanceof Error && error.name === "AbortError" ? "Délai dépassé" : "Réseau indisponible", 0, init.path);
  } finally {
    clearTimeout(timer);
  }
}

async function fail(res: Response, path?: string): Promise<never> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string };
    detail = body.message ?? "";
  } catch {
    /* corps vide */
  }
  const label =
    res.status === 401
      ? "Token refusé"
      : res.status === 403
        ? "Accès interdit (portée du token ou quota)"
        : res.status === 404
          ? "Dépôt ou fichier introuvable"
          : `Erreur GitHub ${res.status}`;
  throw new GitHubError(detail ? `${label} : ${detail}` : label, res.status, path);
}

export function decodeBase64(text: string): Uint8Array {
  const bin = atob(text.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** `null` quand le fichier n'existe pas (première synchro). */
export async function getFile(ref: RepoRef, path: string): Promise<RemoteFile | null> {
  const res = await request(contentsUrl(ref, path), { headers: headers(ref), path });
  if (res.status === 404) return null;
  if (!res.ok) return fail(res, path);
  const meta = (await res.json()) as { sha: string; size: number; content?: string; encoding?: string; type?: string };
  if (meta.type && meta.type !== "file") throw new GitHubError("Le chemin n'est pas un fichier", 400, path);
  if (meta.encoding === "base64" && typeof meta.content === "string") {
    return { sha: meta.sha, size: meta.size, bytes: decodeBase64(meta.content) };
  }
  // Au-delà de 1 Mo, l'API JSON ne renvoie plus le contenu : on le demande en brut.
  const raw = await request(contentsUrl(ref, path), { headers: headers(ref, "application/vnd.github.raw+json"), path });
  if (!raw.ok) return fail(raw, path);
  return { sha: meta.sha, size: meta.size, bytes: new Uint8Array(await raw.arrayBuffer()) };
}

export async function getJson<T>(ref: RepoRef, path: string): Promise<{ sha: string; data: T } | null> {
  const file = await getFile(ref, path);
  if (!file) return null;
  try {
    return { sha: file.sha, data: JSON.parse(new TextDecoder().decode(file.bytes)) as T };
  } catch {
    throw new GitHubError("Fichier JSON illisible", 400, path);
  }
}

/**
 * Crée ou remplace un fichier. `sha` obligatoire pour remplacer (sinon 422) ; s'il ne correspond plus,
 * GitHub répond 409 : `GitHubError.isConflict`.
 */
export async function putFile(
  ref: RepoRef,
  path: string,
  bytes: Uint8Array,
  message: string,
  sha?: string | null,
): Promise<{ sha: string }> {
  const body: Record<string, string> = { message, content: encodeBase64(bytes) };
  if (sha) body.sha = sha;
  if (ref.branch) body.branch = ref.branch;
  const res = await request(contentsUrl(ref, path, false), {
    method: "PUT",
    headers: { ...headers(ref), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    path,
  });
  if (!res.ok) return fail(res, path);
  const out = (await res.json()) as { content: { sha: string } };
  return { sha: out.content.sha };
}

export async function putJson(ref: RepoRef, path: string, data: unknown, message: string, sha?: string | null): Promise<{ sha: string }> {
  return putFile(ref, path, new TextEncoder().encode(JSON.stringify(data, null, 2) + "\n"), message, sha);
}

export type RepoAccess = { fullName: string; isPrivate: boolean; canPush: boolean; defaultBranch: string };

/** Vérifie le token et les droits sur le dépôt, sans rien écrire. */
export async function checkAccess(ref: RepoRef): Promise<RepoAccess> {
  const res = await request(`${API}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`, { headers: headers(ref) });
  if (!res.ok) return fail(res);
  const repo = (await res.json()) as { full_name: string; private: boolean; default_branch: string; permissions?: { push?: boolean } };
  return {
    fullName: repo.full_name,
    isPrivate: repo.private,
    canPush: repo.permissions?.push === true,
    defaultBranch: repo.default_branch,
  };
}
