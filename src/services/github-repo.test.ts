import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubError, checkAccess, decodeBase64, encodeBase64, getFileMeta, getJson, putJson } from "@/services/github-repo";

const ref = { owner: "moi", repo: "vanTravel", token: "t" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("base64", () => {
  it("fait l'aller-retour, y compris sur de l'UTF-8 et des retours de ligne GitHub", () => {
    const bytes = new TextEncoder().encode("Kaikōura · 4521 €");
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    const wrapped = encodeBase64(bytes).replace(/(.{8})/g, "$1\n");
    expect(new TextDecoder().decode(decodeBase64(wrapped))).toBe("Kaikōura · 4521 €");
  });
});

describe("getJson", () => {
  it("lit le contenu base64 et le sha, null sur 404", async () => {
    const payload = { format: 1, hello: "monde" };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("absent.json")) return jsonResponse(404, { message: "Not Found" });
      return jsonResponse(200, { sha: "abc", size: 10, type: "file", encoding: "base64", content: encodeBase64(new TextEncoder().encode(JSON.stringify(payload))) });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getJson(ref, "trips/x/absent.json")).toBeNull();
    expect(await getJson<typeof payload>(ref, "trips/x/travel.json")).toEqual({ sha: "abc", data: payload });
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/moi/vanTravel/contents/trips/x/travel.json");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("getFileMeta lit sha et taille sans contenu, null sur 404", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("absent.json")) return jsonResponse(404, { message: "Not Found" });
      return jsonResponse(200, { sha: "big", size: 5_000_000, type: "file", encoding: "none", content: "" });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getFileMeta(ref, "trips/x/absent.json")).toBeNull();
    expect(await getFileMeta(ref, "trips/x/itinerary.json")).toEqual({ sha: "big", size: 5_000_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repasse en brut quand l'API ne renvoie pas le contenu (fichier > 1 Mo)", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const accept = (init?.headers as Record<string, string>).Accept;
      if (accept.includes("raw")) return new Response(JSON.stringify({ big: true }), { status: 200 });
      return jsonResponse(200, { sha: "big", size: 2_000_000, type: "file", encoding: "none", content: "" });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await getJson(ref, "trips/x/itinerary.json")).toEqual({ sha: "big", data: { big: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("traduit 401 et 403 en erreurs lisibles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { message: "Bad credentials" })));
    await expect(getJson(ref, "trips/index.json")).rejects.toMatchObject({ status: 401, message: "Token refusé : Bad credentials" });
  });
});

describe("putJson", () => {
  it("envoie le sha et la branche, renvoie le nouveau sha", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { content: { sha: "new" } }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await putJson({ ...ref, branch: "main" }, "trips/x/travel.json", { a: 1 }, "Synchro", "old");
    expect(out.sha).toBe("new");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/moi/vanTravel/contents/trips/x/travel.json");
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.sha).toBe("old");
    expect(body.branch).toBe("main");
    expect(body.message).toBe("Synchro");
    expect(new TextDecoder().decode(decodeBase64(body.content))).toBe('{\n  "a": 1\n}\n');
  });

  it("signale le conflit de sha (409) et le sha manquant (422)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, { message: "is at 1 but expected 2" })));
    const error = await putJson(ref, "p", {}, "m", "stale").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).isConflict).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(422, { message: "sha wasn't supplied" })));
    await expect(putJson(ref, "p", {}, "m")).rejects.toMatchObject({ isConflict: true });
  });
});

describe("checkAccess", () => {
  it("lit les droits sans écrire", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { full_name: "moi/vanTravel", private: true, default_branch: "main", permissions: { push: true } })),
    );
    expect(await checkAccess(ref)).toEqual({ fullName: "moi/vanTravel", isPrivate: true, canPush: true, defaultBranch: "main" });
  });
});
