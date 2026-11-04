import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LABEL_TEXT_FIELD } from "@/lib/base-map";
import { loadBaseStyle } from "@/services/base-map";

const fetchMock = vi.fn();

const liberty = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  layers: [{ id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place", layout: { "text-field": ["get", "name_en"] } }],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Le style raster de repli cite les polices locales par une URL absolue.
  vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:43218" } });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fond de carte", () => {
  it("charge le style Liberty avec les noms en français", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(liberty)));
    const { style, vector } = await loadBaseStyle();
    expect(fetchMock.mock.calls[0][0]).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(vector).toBe(true);
    expect(style.layers[0]).toMatchObject({ layout: { "text-field": LABEL_TEXT_FIELD } });
  });

  it("se replie sur les tuiles raster OSM quand le style ne vient pas", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const failed = await loadBaseStyle();
    expect(failed.vector).toBe(false);
    expect(Object.keys(failed.style.sources)).toEqual(["osm"]);
  });

  it("se replie aussi sur une réponse qui n'est pas un style attendu", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
    expect((await loadBaseStyle()).vector).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ version: 8, sources: {}, layers: [] })));
    expect((await loadBaseStyle()).vector).toBe(false);
  });
});
