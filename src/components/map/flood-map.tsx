"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, MapGeoJSONFeature, ExpressionSpecification } from "maplibre-gl";

export const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
export const ISTANBUL: [number, number] = [28.76, 41.06]; // pilot districts (Başakşehir / Küçükçekmece)

export type LayerKey =
  | "events" | "rain" | "elevation" | "slope" | "accumulation" | "buildings" | "roads" | "drainage" | "reports" | "candidates" | "pumps" | "waterways" | "districts" | "hillshade";

export type Metric = "index" | "f_depression" | "f_flatness" | "f_waterProximity" | "f_lowland";

export interface MapFilters { eventFrom: string; eventTo: string; eventPrecision: "all" | "district" | "corridor_approx"; rainMin: number; rainMax: number; metric: Metric }
export interface Selected { kind: "cell" | "event" | "report" | "rain" | "candidate" | "district"; props: Record<string, unknown>; lngLat: [number, number] }

const SCALE_0_100: ExpressionSpecification = ["interpolate", ["linear"], ["get", "index"], 0, "#0e3a5a", 40, "#F59E0B", 60, "#f97316", 80, "#EF4444"];
const factorScale = (k: string): ExpressionSpecification => ["interpolate", ["linear"], ["get", k], 0, "#0e3a5a", 0.5, "#F59E0B", 1, "#EF4444"];
const ELEV: ExpressionSpecification = ["interpolate", ["linear"], ["get", "elev"], 0, "#1d4ed8", 50, "#0ea5e9", 100, "#22c55e", 150, "#eab308", 220, "#f8fafc"];
const SLOPE: ExpressionSpecification = ["interpolate", ["linear"], ["get", "slope"], 0, "#082f49", 2, "#0891b2", 5, "#facc15", 10, "#f97316"];

const SOURCES = ["districts", "waterways", "screening", "events", "candidates", "rain-points", "citizen-reports"] as const;

/** Basemap layers that represent buildings / roads (CARTO vector schema). */
function basemapLayerIds(map: MLMap, sourceLayer: "building" | "transportation") {
  return (map.getStyle().layers ?? []).filter((l) => "source-layer" in l && l["source-layer"] === sourceLayer).map((l) => l.id);
}

export function FloodMap({
  visible, filters, onSelect, interactive = true, reportsUrl = "/api/geo/citizen-reports", flyTo, className, onReady,
}: {
  visible: Partial<Record<LayerKey, boolean>>;
  filters?: MapFilters;
  onSelect?: (s: Selected | null) => void;
  interactive?: boolean;
  reportsUrl?: string;
  flyTo?: { center: [number, number]; zoom?: number } | null;
  className?: string;
  onReady?: (map: MLMap) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;
    (async () => {
      const mod = await import("maplibre-gl");
      const maplibregl = (mod as unknown as { default?: typeof mod }).default ?? mod; // ESM build has no default export
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs"); // copied by postinstall; bundlers do not emit the worker
      if (cancelled || !el.current) return;
      map = new maplibregl.Map({
        container: el.current, style: BASEMAP, center: ISTANBUL, zoom: interactive ? 11 : 10.4,
        interactive, attributionControl: { compact: true }, cooperativeGestures: false,
      });
      mapRef.current = map;
      if (interactive) {
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
      }
      map.on("error", (e) => { if (String(e.error?.message ?? "").includes("style")) setError("Harita altlığı yüklenemedi (ağ bağlantısı?). Katmanlar yine de listelenir."); });
      map.on("load", async () => {
        const m = map!;
        m.addSource("terrain", { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: "Terrain tiles: Mapzen/AWS Open Data (SRTM, GMTED, ETOPO1)" });
        m.addLayer({ id: "hillshade", type: "hillshade", source: "terrain", paint: { "hillshade-shadow-color": "#020617", "hillshade-highlight-color": "#334155", "hillshade-exaggeration": 0.35 }, layout: { visibility: "none" } });
        await Promise.all(SOURCES.map(async (s) => {
          const url = s === "citizen-reports" ? reportsUrl : `/api/geo/${s}`;
          const data = await fetch(url).then((r) => (r.ok ? r.json() : { type: "FeatureCollection", features: [] })).catch(() => ({ type: "FeatureCollection", features: [] }));
          if (s === "citizen-reports" && Array.isArray(data)) {
            // operator view: /api/reports list → features
            m.addSource(s, { type: "geojson", data: { type: "FeatureCollection", features: data.filter((r) => r.lon != null).map((r) => ({ type: "Feature", properties: { id: r.id, category: r.category, status: r.status, district: r.district, observed_at: r.observed_at, provenance: r.provenance }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })) } });
          } else m.addSource(s, { type: "geojson", data });
        }));
        if (cancelled) return;
        m.addLayer({ id: "grid-accumulation", type: "fill", source: "screening", paint: { "fill-color": SCALE_0_100, "fill-opacity": 0.55 }, layout: { visibility: "none" } });
        m.addLayer({ id: "grid-elevation", type: "fill", source: "screening", paint: { "fill-color": ELEV, "fill-opacity": 0.5 }, layout: { visibility: "none" } });
        m.addLayer({ id: "grid-slope", type: "fill", source: "screening", paint: { "fill-color": SLOPE, "fill-opacity": 0.55 }, layout: { visibility: "none" } });
        m.addLayer({ id: "districts-line", type: "line", source: "districts", paint: { "line-color": "#94A3B8", "line-width": 1.5, "line-dasharray": [2, 1] } });
        m.addLayer({ id: "events-fill", type: "fill", source: "events", paint: { "fill-color": "#F59E0B", "fill-opacity": 0.08 } });
        m.addLayer({ id: "events-line", type: "line", source: "events", paint: { "line-color": "#F59E0B", "line-width": 2 } });
        m.addLayer({ id: "waterways", type: "line", source: "waterways", paint: { "line-color": "#22D3EE", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 15, 2.5], "line-opacity": 0.85 } });
        m.addLayer({ id: "rain", type: "circle", source: "rain-points", paint: { "circle-radius": 9, "circle-color": "#38BDF8", "circle-stroke-color": "#F8FAFC", "circle-stroke-width": 2, "circle-opacity": 0.85 } });
        m.addLayer({ id: "candidates", type: "circle", source: "candidates", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 9], "circle-color": "#EF4444", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
        m.addLayer({ id: "candidates-label", type: "symbol", source: "candidates", layout: { "text-field": "▲", "text-size": 10, "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
        m.addLayer({ id: "reports", type: "circle", source: "citizen-reports", paint: { "circle-radius": 6, "circle-color": ["match", ["get", "status"], "verified", "#22C55E", "rejected", "#64748b", "#22D3EE"], "circle-stroke-color": "#081426", "circle-stroke-width": 2 } });

        for (const id of ["grid-accumulation", "grid-elevation", "grid-slope", "events-fill", "rain", "candidates", "reports", "districts-line"]) {
          m.on("mouseenter", id, () => { m.getCanvas().style.cursor = "pointer"; });
          m.on("mouseleave", id, () => { m.getCanvas().style.cursor = ""; });
        }
        m.on("click", (e) => {
          const order = ["candidates", "reports", "rain", "grid-accumulation", "grid-elevation", "grid-slope", "events-fill"];
          const hits = m.queryRenderedFeatures(e.point, { layers: order.filter((l) => m.getLayer(l) && m.getLayoutProperty(l, "visibility") !== "none") });
          const f: MapGeoJSONFeature | undefined = hits.sort((a, b) => order.indexOf(a.layer.id) - order.indexOf(b.layer.id))[0];
          if (!f) return onSelectRef.current?.(null);
          const kind = f.layer.id === "candidates" ? "candidate" : f.layer.id === "reports" ? "report" : f.layer.id === "rain" ? "rain" : f.layer.id === "events-fill" ? "event" : "cell";
          onSelectRef.current?.({ kind, props: f.properties ?? {}, lngLat: [e.lngLat.lng, e.lngLat.lat] });
        });
        setReady(true);
        onReady?.(m);
      });
    })();
    return () => { cancelled = true; map?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, reportsUrl]);

  // visibility
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    const set = (id: string, on: boolean | undefined) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    set("events-fill", visible.events); set("events-line", visible.events);
    set("rain", visible.rain);
    set("grid-elevation", visible.elevation); set("hillshade", visible.elevation || visible.hillshade);
    set("grid-slope", visible.slope);
    set("grid-accumulation", visible.accumulation);
    set("reports", visible.reports);
    set("candidates", visible.candidates); set("candidates-label", visible.candidates);
    set("waterways", visible.waterways);
    set("districts-line", visible.districts ?? true);
    basemapLayerIds(m, "building").forEach((id) => set(id, visible.buildings));
    basemapLayerIds(m, "transportation").forEach((id) => set(id, visible.roads ?? true));
  }, [visible, ready]);

  // filters
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !filters) return;
    const evFilter: ExpressionSpecification = ["all",
      [">=", ["get", "date"], filters.eventFrom || "0000"],
      ["<=", ["get", "date"], filters.eventTo || "9999"],
      ...(filters.eventPrecision === "all" ? [] : [["==", ["get", "precision"], filters.eventPrecision] as ExpressionSpecification]),
    ];
    m.setFilter("events-fill", evFilter); m.setFilter("events-line", evFilter);
    const rainVal: ExpressionSpecification = ["max", ["coalesce", ["get", "total_2009"], 0], ["coalesce", ["get", "total_2023"], 0]];
    m.setFilter("rain", ["all", [">=", rainVal, filters.rainMin], ["<=", rainVal, filters.rainMax]]);
    m.setPaintProperty("grid-accumulation", "fill-color", filters.metric === "index" ? SCALE_0_100 : factorScale(filters.metric));
  }, [filters, ready]);

  useEffect(() => {
    if (flyTo && mapRef.current && ready) mapRef.current.flyTo({ center: flyTo.center, zoom: flyTo.zoom ?? 13, essential: true });
  }, [flyTo, ready]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={el} className="h-full w-full" data-testid="flood-map" data-ready={ready ? "true" : "false"} role="region" aria-label="İstanbul taşkın haritası" />
      {error && <div className="absolute left-2 top-2 z-10 rounded-md bg-critical/80 px-2 py-1 text-xs">{error}</div>}
    </div>
  );
}
