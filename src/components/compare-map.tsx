
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Popup } from "maplibre-gl";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, buildMapStyle } from "@/lib/constants";
import { absoluteAssetUrl } from "@/lib/base-url";
import { getRegion } from "@/lib/regions";
import { showReactPopup } from "@/components/react-popup";
import { useTripStore } from "@/store/trip-store";
import { boundsFromFeatures, tripRouteFeatures } from "@/lib/compare";
import type { SavedTrip } from "@/lib/types";

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function CompareMap({ trips, colors }: { trips: SavedTrip[]; colors: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const tripsRef = useRef(trips);
  const colorsRef = useRef(colors);
  const [mapReady, setMapReady] = useState(false);

  const sync = useCallback((map: MapLibreMap) => {
    const lines: GeoJSON.Feature[] = [];
    const points: GeoJSON.Feature[] = [];
    tripsRef.current.forEach((trip, index) => {
      const color = colorsRef.current[index] ?? "#0f766e";
      const features = tripRouteFeatures(trip, color, index);
      lines.push(...features.lines);
      points.push(...features.points);
    });
    (map.getSource("compare-lines") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: lines,
    });
    (map.getSource("compare-points") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: points,
    });
    const bounds = boundsFromFeatures([...lines, ...points]);
    if (bounds) {
      map.fitBounds(bounds, { padding: 48, maxZoom: 8.5, duration: 500 });
    }
  }, []);

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
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: "240px" });

      const initLayers = () => {
        if (map.getSource("compare-lines")) return;
        map.addSource("compare-lines", { type: "geojson", data: emptyFc() });
        map.addSource("compare-points", { type: "geojson", data: emptyFc() });
        map.addLayer({
          id: "compare-lines-casing",
          type: "line",
          source: "compare-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#fff", "line-width": 7, "line-opacity": 0.7 },
        });
        map.addLayer({
          id: "compare-lines",
          type: "line",
          source: "compare-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#0f766e"],
            "line-width": 4,
            "line-opacity": 0.88,
          },
        });
        map.addLayer({
          id: "compare-points",
          type: "circle",
          source: "compare-points",
          paint: {
            "circle-radius": ["case", ["==", ["get", "overnight"], 1], 8, 5],
            "circle-color": ["coalesce", ["get", "color"], "#0f766e"],
            "circle-stroke-width": 1.6,
            "circle-stroke-color": "#fff",
          },
        });
        setMapReady(true);
        sync(map);
      };

      map.on("style.load", initLayers);
      map.on("load", initLayers);
      if (map.isStyleLoaded()) initLayers();

      map.on("click", (event: MapMouseEvent) => {
        if (!map.getLayer("compare-points")) return;
        const hits = map.queryRenderedFeatures(event.point, { layers: ["compare-points"] });
        const hit = hits[0];
        if (!hit) {
          popupRef.current?.remove();
          return;
        }
        const props = hit.properties ?? {};
        if (!popupRef.current) return;
        showReactPopup(
          popupRef.current,
          map,
          event.lngLat,
          <div className="p-3 text-foreground">
            <p className="text-xs font-medium">{String(props.tripName ?? "")}</p>
            <p className="text-sm">{String(props.name ?? "")}</p>
            <p className="text-xs opacity-70">
              {String(props.dayLabel ?? "")}
              {props.overnight ? " · nuit" : ""}
            </p>
          </div>,
        );
      });
    }

    void initMap();
    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [sync]);

  useEffect(() => {
    // Les refs servent au handler d'init de la carte, qui ne voit pas les props courantes.
    tripsRef.current = trips;
    colorsRef.current = colors;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    sync(map);
  }, [trips, colors, mapReady, sync]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el || !mapReady) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);
    map.resize();
    return () => observer.disconnect();
  }, [mapReady]);

  return <div ref={containerRef} className="size-full min-h-[280px] bg-muted" />;
}

