
import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  LngLat,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  Popup,
} from "maplibre-gl";
import { buildCatalog, type Catalog } from "@/lib/catalog";
import { asPointCollection } from "@/lib/geo";
import { amenityChipsHtml, amenitiesFromProperties, amenitySummary } from "@/lib/amenities";
import { dayColor, MAP_MAX_ZOOM, MAP_MIN_ZOOM, buildMapStyle } from "@/lib/constants";
import { setActiveMap } from "@/lib/map-registry";
import { absoluteAssetUrl } from "@/lib/base-url";
import { getRegion } from "@/lib/regions";
import { loadDataset } from "@/services/datasets";
import type { CatalogPlace, LayersState, PlaceInput, PlaceKind } from "@/lib/types";
import { selectedOption, useTripStore } from "@/store/trip-store";
import { AlternativesCard } from "@/components/alternatives-card";
import { CustomPinDialog } from "@/components/custom-pin-dialog";
import { LayerControls } from "@/components/layer-controls";

const CLICKABLE = [
  "towns-circle",
  "pois-circle",
  "stays-circle",
  "camps-circle",
  "osm-camps-circle",
  "freedom-fill",
  "custom-circle",
  "itinerary-points",
];

function presentLayers(map: MapLibreMap, ids: string[]): string[] {
  return ids.filter((id) => map.getLayer(id));
}

function placesToGeoJSON(places: CatalogPlace[], kind: PlaceKind): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      id: place.id,
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        name: place.name,
        kind,
        region: place.region,
        area: place.area ?? "",
        notes: place.notes ?? "",
        category: place.category ?? "",
        warning: place.warning ?? "",
      },
    })),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function syncItinerary(map: MapLibreMap) {
  const state = useTripStore.getState();
  const lineFeatures: GeoJSON.Feature[] = [];
  const pointFeatures: GeoJSON.Feature[] = [];
  let seq = 0;
  state.days.forEach((day, dayIndex) => {
    const color = dayColor(dayIndex);
    for (const stopId of day.stopIds) {
      const stop = state.stops[stopId];
      if (!stop) continue;
      seq += 1;
      pointFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [stop.lng, stop.lat] },
        properties: {
          seq,
          name: stop.name,
          overnight: stop.isOvernight,
          color,
          dayLabel: `${day.weekday} ${day.label}`,
          placeId: stop.placeId,
          kind: stop.kind,
          notes: stop.notes ?? "",
          warning: stop.warning ?? "",
        },
      });
    }
    for (const leg of state.legs.filter((l) => l.dayIndex === dayIndex)) {
      const option = selectedOption(leg);
      if (!option) continue;
      lineFeatures.push({
        type: "Feature",
        geometry: option.geometry,
        properties: { color, estimated: leg.estimated, dayIndex },
      });
    }
  });
  const lines = map.getSource("itinerary-lines") as GeoJSONSource | undefined;
  const points = map.getSource("itinerary-points") as GeoJSONSource | undefined;
  lines?.setData({ type: "FeatureCollection", features: lineFeatures });
  points?.setData({ type: "FeatureCollection", features: pointFeatures });
}

function onFeatureClick(
  map: MapLibreMap,
  feature: MapGeoJSONFeature,
  lngLat: LngLat,
  popup: Popup | null,
) {
  const props = feature.properties ?? {};
  const layer = feature.layer.id;
  const coords = lngLat;

  if (layer === "itinerary-points") {
    const name = String(props.name ?? "Lieu");
    const node = document.createElement("div");
    node.className = "p-3 text-sm w-[240px]";
    node.innerHTML = `
      <p class="font-medium leading-tight">${escapeHtml(name)}</p>
      <p class="mt-1 text-xs opacity-70">Étape ${escapeHtml(String(props.seq ?? ""))} · ${escapeHtml(String(props.dayLabel ?? ""))}</p>
      <button type="button" data-add class="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg bg-emerald-800 text-white text-xs font-medium">Repasser ici</button>
    `;
    node.querySelector("[data-add]")?.addEventListener("click", () => {
      const point = pointOf(feature, coords);
      void useTripStore.getState().addPlace({
        placeId: String(props.placeId ?? name),
        name,
        lng: point[0],
        lat: point[1],
        kind: (props.kind as PlaceKind) || "custom",
        notes: String(props.notes ?? "") || undefined,
        warning: String(props.warning ?? "") || undefined,
      });
      popup?.remove();
    });
    popup?.setLngLat(coords).setDOMContent(node).addTo(map);
    return;
  }

  const name = String(props.name ?? props.Name ?? "Lieu");
  const kind = inferKind(layer, props);
  const notes = String(props.notes ?? props.introduction ?? props.Condition_1 ?? "");
      const extra = extraLines(kind, props);
      const amenityHtml = amenityChipsHtml(amenitiesFromProperties(props));
      const warning = String(props.warning ?? "");
      const docLink = typeof props.staticLink === "string" ? props.staticLink : "";
      const webLink = typeof props.website === "string" ? props.website : "";
      const link = docLink || webLink;
      const linkLabel = docLink ? "Fiche DOC" : "Site web";
      const node = document.createElement("div");
      node.className = "p-3 text-sm w-[240px]";
      node.innerHTML = `
      <p class="font-medium leading-tight">${escapeHtml(name)}</p>
      <p class="mt-1 text-xs opacity-70">${escapeHtml(kindLabel(kind, props))}${props.region || props.Location || props.operator ? ` · ${escapeHtml(String(props.region || props.Location || props.operator))}` : ""}</p>
      ${extra}
      ${amenityHtml}
      ${notes ? `<p class="mt-2 text-xs leading-snug opacity-80">${escapeHtml(notes.slice(0, 220))}</p>` : ""}
      ${warning ? `<p class="mt-2 text-xs text-red-700">${escapeHtml(warning)}</p>` : ""}
      ${link ? `<a class="mt-2 inline-block text-xs underline" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${linkLabel}</a>` : ""}
      <button type="button" data-add class="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg bg-emerald-800 text-white text-xs font-medium">Ajouter à l’itinéraire</button>
    `;
  node.querySelector("[data-add]")?.addEventListener("click", () => {
    const point = pointOf(feature, coords);
    const place: PlaceInput = {
        placeId: String(props.id ?? props.assetId ?? props.OBJECTID ?? name),
        name,
        lng: point[0],
        lat: point[1],
        kind,
        notes: notes || undefined,
        warning: warning || undefined,
        area: String(props.area ?? "") || undefined,
        meta: {
          amenities: amenitySummary(amenitiesFromProperties(props)) || null,
          source: String(props.source ?? ""),
        },
      };
    void useTripStore.getState().addPlace(place);
    popup?.remove();
  });
  popup?.setLngLat(coords).setDOMContent(node).addTo(map);
}

export function TripMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);

  const days = useTripStore((s) => s.days);
  const stops = useTripStore((s) => s.stops);
  const legs = useTripStore((s) => s.legs);
  const layers = useTripStore((s) => s.layers);
  const customPins = useTripStore((s) => s.customPins);
  const pinMode = useTripStore((s) => s.pinMode);
  const routingStatus = useTripStore((s) => s.routingStatus);
  const routingMessage = useTripStore((s) => s.routingMessage);
  const config = useTripStore((s) => s.config);

  const [camps, setCamps] = useState<GeoJSON.FeatureCollection | null>(null);
  const [osmCamps, setOsmCamps] = useState<GeoJSON.FeatureCollection | null>(null);
  const [freedom, setFreedom] = useState<GeoJSON.FeatureCollection | null>(null);
  const [campsError, setCampsError] = useState<string | null>(null);
  const [osmCampsError, setOsmCampsError] = useState<string | null>(null);
  const [freedomError, setFreedomError] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ lng: number; lat: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    async function initMap() {
      const maplibregl = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !containerRef.current || mapRef.current) return;

      // Worker copié dans public/maplibre/ par scripts/copy-maplibre-worker.mjs.
      maplibregl.setWorkerUrl(absoluteAssetUrl("maplibre/maplibre-gl-worker.mjs"));
      const region = getRegion(useTripStore.getState().config?.regionId);
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: buildMapStyle(),
        center: region.center,
        zoom: region.zoom,
        minZoom: MAP_MIN_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        maxBounds: region.maxBounds,
        renderWorldCopies: false,
        attributionControl: {},
        interactive: true,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
      mapRef.current = map;
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" });
      setActiveMap(map);

      // Tile-level failures are transient and must not blank the whole map.
      map.on("error", (event) => {
        console.error("MapLibre error", event.error ?? event);
      });
      const initLayers = () => {
        if (map.getLayer("towns-circle")) return;
        try {
          addCatalogLayers(map);
          addDocLayers(map);
          addOsmCampLayers(map);
          addItineraryLayers(map);
          syncVisibility(map, useTripStore.getState().layers);
          syncItinerary(map);
          syncCustom(map, useTripStore.getState().customPins);
          syncCatalog(map, buildCatalog(useTripStore.getState().config));
          setMapReady(true);
          setMapError(null);
        } catch (error) {
          setMapError(error instanceof Error ? error.message : "Calques indisponibles.");
        }
      };

      map.on("style.load", initLayers);
      map.on("load", initLayers);
      if (map.isStyleLoaded()) initLayers();

    map.on("click", (event: MapMouseEvent) => {
      const pad = 14;
      const box: [[number, number], [number, number]] = [
        [event.point.x - pad, event.point.y - pad],
        [event.point.x + pad, event.point.y + pad],
      ];
      const clusterLayers = presentLayers(map, ["camps-cluster", "osm-camps-cluster"]);
      const cluster = clusterLayers.length
        ? map.queryRenderedFeatures(box, { layers: clusterLayers })[0]
        : undefined;
      if (cluster && cluster.properties?.cluster_id != null) {
        const sourceId = cluster.layer.id.startsWith("osm-") ? "osm-camps" : "camps";
        const source = map.getSource(sourceId) as GeoJSONSource;
        const clusterId = Number(cluster.properties.cluster_id);
        const coords = (cluster.geometry as GeoJSON.Point).coordinates as [number, number];
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: coords, zoom });
        });
        return;
      }
      const clickable = presentLayers(map, CLICKABLE);
      const features = clickable.length
        ? map.queryRenderedFeatures(box, { layers: clickable })
        : [];
      const catalog = features.find((f) => f.layer.id !== "itinerary-points");
      if (catalog) {
        onFeatureClick(map, catalog, event.lngLat, popupRef.current);
        return;
      }
      if (features[0]) {
        onFeatureClick(map, features[0], event.lngLat, popupRef.current);
        return;
      }
      if (useTripStore.getState().pinMode) {
        setDraftPin({ lng: event.lngLat.lng, lat: event.lngLat.lat });
      }
    });

    for (const layer of CLICKABLE) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = useTripStore.getState().pinMode ? "crosshair" : "";
      });
    }
    }

    void initMap().catch((error: Error) => {
      if (!cancelled) setMapError(error.message);
    });

    return () => {
      cancelled = true;
      setActiveMap(null);
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncVisibility(map, layers);
  }, [layers, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncCatalog(map, buildCatalog(config));
  }, [config, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el || !mapReady) return;
    // Onglets mobile : le conteneur passe de display:none à visible, la carte doit se remesurer.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);
    map.resize();
    return () => observer.disconnect();
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncItinerary(map);
  }, [days, stops, legs, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncCustom(map, customPins);
  }, [customPins, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      map.getCanvas().style.cursor = pinMode ? "crosshair" : "";
    }
  }, [pinMode]);

  useEffect(() => {
    let cancelled = false;
    loadDataset("doc-campsites")
      .then((data) => {
        if (!cancelled) setCamps(asPointCollection(data));
      })
      .catch((error: Error) => {
        if (!cancelled) setCampsError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadDataset("osm-camps")
      .then((data) => {
        if (!cancelled) setOsmCamps(asPointCollection(data));
      })
      .catch((error: Error) => {
        if (!cancelled) setOsmCampsError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadDataset("doc-freedom")
      .then((data) => {
        if (!cancelled) setFreedom(data);
      })
      .catch((error: Error) => {
        if (!cancelled) setFreedomError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (camps) (map.getSource("camps") as GeoJSONSource | undefined)?.setData(camps);
    if (osmCamps) (map.getSource("osm-camps") as GeoJSONSource | undefined)?.setData(osmCamps);
    if (freedom) (map.getSource("freedom") as GeoJSONSource | undefined)?.setData(freedom);
  }, [mapReady, camps, osmCamps, freedom]);

  return (
    <div className="relative h-full min-h-[50vh] w-full">
      <div ref={containerRef} className="h-full w-full bg-[#d7e4d8]" />
      {!mapReady && !mapError && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-[5] -translate-x-1/2 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
          Chargement de la carte…
        </div>
      )}
      {mapError && (
        <div className="absolute inset-x-3 top-16 z-10 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Carte : {mapError}
        </div>
      )}
      <LayerControls
        campsError={campsError}
        osmCampsError={osmCampsError}
        freedomError={freedomError}
        campsLoading={!camps && !campsError}
        osmCampsLoading={!osmCamps && !osmCampsError}
      />
      <AlternativesCard />
      {routingStatus !== "idle" || routingMessage ? (
        <div className="pointer-events-none absolute top-3 left-1/2 z-10 max-w-sm -translate-x-1/2 rounded-full bg-background/95 px-3 py-1.5 text-center text-xs shadow ring-1 ring-foreground/10">
          {routingStatus === "loading" ? "Calcul de la route van…" : routingMessage}
        </div>
      ) : null}
      <CustomPinDialog
        open={draftPin != null}
        lng={draftPin?.lng ?? null}
        lat={draftPin?.lat ?? null}
        onClose={() => setDraftPin(null)}
      />
    </div>
  );
}

function addCatalogLayers(map: MapLibreMap) {
  map.addSource("towns", { type: "geojson", data: emptyFc() });
  map.addSource("pois", { type: "geojson", data: emptyFc() });
  map.addSource("stays", { type: "geojson", data: emptyFc() });
  map.addLayer({
    id: "towns-circle",
    type: "circle",
    source: "towns",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 11],
      "circle-color": "#f8f4e8",
      "circle-stroke-color": "#1f3d34",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "towns-label",
    type: "symbol",
    source: "towns",
    minzoom: 6,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 12,
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-font": ["Noto Sans Regular"],
    },
    paint: { "text-color": "#1f3d34", "text-halo-color": "#fff", "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: "pois-circle",
    type: "circle",
    source: "pois",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 10],
      "circle-color": [
        "case",
        ["==", ["get", "category"], "interdit-locateur"],
        "#b91c1c",
        "#ea580c",
      ],
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "pois-label",
    type: "symbol",
    source: "pois",
    minzoom: 7,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-font": ["Noto Sans Regular"],
    },
    paint: { "text-color": "#7c4a03", "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "stays-circle",
    type: "circle",
    source: "stays",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 11],
      "circle-color": "#0f766e",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "stays-label",
    type: "symbol",
    source: "stays",
    minzoom: 7,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-font": ["Noto Sans Regular"],
    },
    paint: { "text-color": "#115e59", "text-halo-color": "#fff", "text-halo-width": 1.3 },
  });
}

function addDocLayers(map: MapLibreMap) {
  map.addSource("camps", {
    type: "geojson",
    data: emptyFc(),
    cluster: true,
    clusterRadius: 36,
    clusterMaxZoom: 12,
  });
  map.addSource("freedom", { type: "geojson", data: emptyFc() });
  map.addLayer({
    id: "camps-cluster",
    type: "circle",
    source: "camps",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#0f766e",
      "circle-radius": ["step", ["get", "point_count"], 12, 8, 16, 20, 20],
      "circle-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "camps-cluster-count",
    type: "symbol",
    source: "camps",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 11,
      "text-font": ["Noto Sans Regular"],
    },
    paint: { "text-color": "#fff" },
  });
  map.addLayer({
    id: "camps-circle",
    type: "circle",
    source: "camps",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 7,
      "circle-color": "#0f766e",
      "circle-stroke-color": "#ecfdf5",
      "circle-stroke-width": 1.6,
    },
  });
  map.addLayer({
    id: "freedom-fill",
    type: "fill",
    source: "freedom",
    paint: {
      "fill-color": [
        "match",
        ["downcase", ["to-string", ["coalesce", ["get", "Site_Category_Type"], ""]]],
        "prohibited",
        "#dc2626",
        "restricted",
        "#ea580c",
        "freedom",
        "#16a34a",
        "#2563eb",
      ],
      "fill-opacity": 0.28,
    },
  });
  map.addLayer({
    id: "freedom-line",
    type: "line",
    source: "freedom",
    paint: {
      "line-color": [
        "match",
        ["downcase", ["to-string", ["coalesce", ["get", "Site_Category_Type"], ""]]],
        "prohibited",
        "#991b1b",
        "restricted",
        "#c2410c",
        "freedom",
        "#15803d",
        "#1d4ed8",
      ],
      "line-width": 1.2,
    },
  });
}

function addOsmCampLayers(map: MapLibreMap) {
  map.addSource("osm-camps", {
    type: "geojson",
    data: emptyFc(),
    cluster: true,
    clusterRadius: 36,
    clusterMaxZoom: 12,
  });
  map.addLayer({
    id: "osm-camps-cluster",
    type: "circle",
    source: "osm-camps",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#b45309",
      "circle-radius": ["step", ["get", "point_count"], 12, 8, 16, 20, 20],
      "circle-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "osm-camps-cluster-count",
    type: "symbol",
    source: "osm-camps",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 11,
      "text-font": ["Noto Sans Regular"],
    },
    paint: { "text-color": "#fff" },
  });
  map.addLayer({
    id: "osm-camps-circle",
    type: "circle",
    source: "osm-camps",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": 6.5,
      "circle-color": [
        "match",
        ["to-string", ["coalesce", ["get", "kind"], ""]],
        "dump",
        "#0369a1",
        "#b45309",
      ],
      "circle-stroke-color": "#fff7ed",
      "circle-stroke-width": 1.4,
    },
  });
}

function addItineraryLayers(map: MapLibreMap) {
  map.addSource("itinerary-lines", { type: "geojson", data: emptyFc() });
  map.addSource("itinerary-points", { type: "geojson", data: emptyFc() });
  map.addSource("custom-pins", { type: "geojson", data: emptyFc() });
  map.addLayer({
    id: "itinerary-lines",
    type: "line",
    source: "itinerary-lines",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#0f766e"],
      "line-width": 4.5,
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "itinerary-points",
    type: "circle",
    source: "itinerary-points",
    paint: {
      "circle-radius": 9,
      "circle-color": ["coalesce", ["get", "color"], "#0f766e"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });
  map.addLayer({
    id: "itinerary-numbers",
    type: "symbol",
    source: "itinerary-points",
    layout: {
      "text-field": ["to-string", ["get", "seq"]],
      "text-size": 10,
      "text-font": ["Noto Sans Bold"],
    },
    paint: { "text-color": "#fff" },
  });
  map.addLayer({
    id: "custom-circle",
    type: "circle",
    source: "custom-pins",
    paint: {
      "circle-radius": 7,
      "circle-color": "#7c3aed",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1.4,
    },
  });
}

function syncCustom(map: MapLibreMap, pins: PlaceInput[]) {
  const source = map.getSource("custom-pins") as GeoJSONSource | undefined;
  source?.setData({
    type: "FeatureCollection",
    features: pins.map((pin) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
      properties: {
        id: pin.placeId,
        name: pin.name,
        kind: "custom",
        notes: pin.notes ?? "",
        category: pin.meta?.category ?? "custom",
      },
    })),
  });
}

function syncVisibility(map: MapLibreMap, layers: LayersState) {
  const vis = (on: boolean) => (on ? "visible" : "none");
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on));
  };
  set("towns-circle", layers.towns);
  set("towns-label", layers.towns);
  set("pois-circle", layers.pois);
  set("pois-label", layers.pois);
  set("stays-circle", true);
  set("stays-label", true);
  set("camps-circle", layers.camps);
  set("camps-cluster", layers.camps);
  set("camps-cluster-count", layers.camps);
  set("osm-camps-circle", layers.osmCamps);
  set("osm-camps-cluster", layers.osmCamps);
  set("osm-camps-cluster-count", layers.osmCamps);
  set("freedom-fill", layers.freedom);
  set("freedom-line", layers.freedom);
  set("custom-circle", layers.custom);
}

function inferKind(layer: string, props: GeoJSON.GeoJsonProperties): PlaceKind {
  if (layer.startsWith("towns")) return "town";
  if (layer.startsWith("pois")) return "poi";
  if (layer.startsWith("stays") || layer.startsWith("osm-camps") || layer.startsWith("camps")) return "camp";
  if (layer.startsWith("freedom")) return "freedom";
  if (layer.startsWith("custom")) return "custom";
  return (props?.kind as PlaceKind) ?? "custom";
}

function kindLabel(kind: PlaceKind, props?: GeoJSON.GeoJsonProperties): string {
  if (kind === "camp" && props?.source === "OSM") {
    if (props.amenity === "sanitary_dump_station") return "Dump station";
    if (props.tourism === "caravan_site") return "Holiday park";
    return "Camping OSM";
  }
  switch (kind) {
    case "town":
      return "Ville";
    case "poi":
      return "Spot";
    case "camp":
      if (props?.category === "lodge") return "Lodge";
      if (props?.category === "holiday-park") return "Holiday park";
      if (props?.category === "campsite") return "Campsite";
      return "Camping DOC";
    case "freedom":
      return "Freedom camping";
    default:
      return "Pin perso";
  }
}

function extraLines(kind: PlaceKind, props: GeoJSON.GeoJsonProperties): string {
  if (kind === "camp" && props?.source === "OSM") {
    const type =
      props.amenity === "sanitary_dump_station"
        ? "Vidange"
        : props.tourism === "caravan_site"
          ? "Holiday park"
          : "Camping / aire";
    return `<p class="mt-1 text-xs">${type} · OpenStreetMap</p>`;
  }
  if (kind === "camp") {
    const cat = props?.campsiteCategory ? escapeHtml(String(props.campsiteCategory)) : "";
    const bookable = props?.bookable ? `Réservable : ${escapeHtml(String(props.bookable))}` : "";
    const unpowered = props?.numberOfUnpoweredSites
      ? `${props.numberOfUnpoweredSites} non-électriques`
      : "";
    const powered = props?.numberOfPoweredSites
      ? `${props.numberOfPoweredSites} électriques`
      : "";
    const bits = [cat, bookable, unpowered, powered].filter(Boolean).join(" · ");
    return bits ? `<p class="mt-1 text-xs">${bits}</p>` : "";
  }
  if (kind === "freedom") {
    const cat = escapeHtml(String(props?.Site_Category_Type ?? ""));
    return cat ? `<p class="mt-1 text-xs">Catégorie DOC : ${cat}</p>` : "";
  }
  if (props?.category) {
    return `<p class="mt-1 text-xs">${escapeHtml(String(props.category))}</p>`;
  }
  return "";
}

function pointOf(feature: MapGeoJSONFeature, fallback: LngLat): [number, number] {
  const g = feature.geometry;
  if (g.type === "Point") return g.coordinates as [number, number];
  return [fallback.lng, fallback.lat];
}

/** Catalogue public de la région + hébergements du voyage : rechargé quand le voyage change. */
function syncCatalog(map: MapLibreMap, catalog: Catalog) {
  (map.getSource("towns") as GeoJSONSource | undefined)?.setData(placesToGeoJSON(catalog.towns, "town"));
  (map.getSource("pois") as GeoJSONSource | undefined)?.setData(placesToGeoJSON(catalog.pois, "poi"));
  (map.getSource("stays") as GeoJSONSource | undefined)?.setData(placesToGeoJSON(catalog.stays, "camp"));
}
