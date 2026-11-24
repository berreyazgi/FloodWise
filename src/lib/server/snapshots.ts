import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { GridCell } from "@/lib/domain/risk";
import type { LonLat } from "@/lib/domain/geo";

const DIR = path.join(process.cwd(), "data", "snapshots");
const cache = new Map<string, unknown>();

function load<T>(name: string): T | null {
  if (cache.has(name)) return cache.get(name) as T;
  const file = path.join(DIR, name);
  if (!existsSync(file)) return null;
  const v = JSON.parse(readFileSync(file, "utf8")) as T;
  cache.set(name, v);
  return v;
}

type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
export interface DistrictsSnap { source: string; license: string; fetched_at: string; districts: { id: string; name: string; bbox: number[]; geometry: Geometry }[] }
export interface ElevSnap { source: string; resolution_m: number; sample_spacing_deg: number; license: string; fetched_at: string; grids: { district_id: string; step_deg: number; cells: GridCell[] }[] }
export interface WaterSnap { source: string; license: string; fetched_at: string; type: "FeatureCollection"; features: { type: "Feature"; properties: { osm_id: number; name: string | null; waterway: string; tunnel: string | null }; geometry: { type: "LineString"; coordinates: LonLat[] } }[] }
export interface RainSeries { district_id: string; kind: "hourly" | "daily"; lat: number; lon: number; grid_lat: number; grid_lon: number; start: string; end: string; time: string[]; precipitation_mm: (number | null)[] }
export interface RainSnap { source: string; license: string; fetched_at: string; timezone: string; series: RainSeries[] }

export const snapshots = {
  districts: () => load<DistrictsSnap>("districts.json"),
  elevation: () => load<ElevSnap>("elevation-grid.json"),
  waterways: () => load<WaterSnap>("waterways.json"),
  rainfall: () => load<RainSnap>("rainfall.json"),
};

export function snapshotStatus() {
  return (Object.keys(snapshots) as (keyof typeof snapshots)[]).map((k) => {
    const s = snapshots[k]() as { source: string; fetched_at: string; license: string } | null;
    return { key: k, available: !!s, source: s?.source ?? null, fetched_at: s?.fetched_at ?? null, license: s?.license ?? null };
  });
}
