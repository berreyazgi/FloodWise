import { connection } from "next/server";
import { snapshots } from "@/lib/server/snapshots";
import { screeningGeoJSON } from "@/lib/server/risk-service";
import { getLocation, latestAnalysis, listEvents, listLocations, listReports } from "@/lib/server/repo";
import { getDb } from "@/lib/server/db";
import { summarizeHourly } from "@/lib/domain/rainfall";

/** GeoJSON layers for the map. Citizen reports here are public-safe (verified only, coarsened). */
export async function GET(_req: Request, ctx: RouteContext<"/api/geo/[layer]">) {
  await connection();
  const { layer } = await ctx.params;
  switch (layer) {
    case "districts": {
      const d = snapshots.districts();
      if (!d) break;
      return Response.json({ type: "FeatureCollection", meta: { source: d.source, license: d.license, fetched_at: d.fetched_at },
        features: d.districts.map((x) => ({ type: "Feature", properties: { id: x.id, name: x.name }, geometry: x.geometry })) });
    }
    case "waterways": {
      const w = snapshots.waterways();
      if (!w) break;
      return Response.json({ ...w, meta: { source: w.source, license: w.license, fetched_at: w.fetched_at } });
    }
    case "screening": {
      const e = snapshots.elevation();
      if (!e) break;
      return Response.json({ ...screeningGeoJSON(), meta: { source: e.source, resolution_m: e.resolution_m, fetched_at: e.fetched_at } });
    }
    case "study-areas":
      return Response.json({ type: "FeatureCollection", features: listLocations().map((l) => ({ type: "Feature", properties: { id: l.id, name: l.name, kind: l.kind, precision: l.geographic_precision, provenance: l.provenance }, geometry: l.geometry })) });
    case "events": {
      // event study areas: approximate corridor or district geometry — never a fabricated point
      const rows = getDb().prepare("SELECT id, location_id FROM historical_events").all() as { id: string; location_id: string }[];
      const evs = new Map(listEvents().map((e) => [e.id, e]));
      return Response.json({ type: "FeatureCollection", features: rows.flatMap((r) => {
        const e = evs.get(r.id), l = getLocation(r.location_id);
        return e && l ? [{ type: "Feature", properties: { id: e.id, title: e.title, date: e.event_date, classification: e.classification, precision: e.geographic_precision, provenance: e.verified_status }, geometry: l.geometry }] : [];
      }) });
    }
    case "candidates": {
      const seen = new Set<string>();
      const features = listLocations().flatMap((l) => (latestAnalysis(l.id)?.explanation.candidates ?? [])
        .filter((c) => c.index >= 60 && !seen.has(c.id) && seen.add(c.id))
        .map((c) => ({ type: "Feature", properties: { id: c.id, index: c.index, stability: c.stability, location_id: l.id, location_name: l.name, explanation: c.explanation }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } })));
      return Response.json({ type: "FeatureCollection", features });
    }
    case "rain-points": {
      const r = snapshots.rainfall();
      if (!r) break;
      const byPt = new Map<string, { lon: number; lat: number; district_id: string; totals: Record<string, number> }>();
      for (const s of r.series.filter((x) => x.kind === "hourly")) {
        const k = `${s.grid_lon},${s.grid_lat}`;
        const rec = byPt.get(k) ?? { lon: s.grid_lon, lat: s.grid_lat, district_id: s.district_id, totals: {} };
        rec.totals[s.start.slice(0, 4)] = summarizeHourly(s.precipitation_mm).total_mm;
        byPt.set(k, rec);
      }
      return Response.json({ type: "FeatureCollection", meta: { source: r.source, fetched_at: r.fetched_at },
        features: [...byPt.values()].map((p) => ({ type: "Feature", properties: { district_id: p.district_id, total_2009: p.totals["2009"] ?? null, total_2023: p.totals["2023"] ?? null }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) });
    }
    case "citizen-reports":
      return Response.json({ type: "FeatureCollection", features: listReports({ publicView: true }).filter((r) => r.lon != null).map((r) => ({ type: "Feature", properties: { id: r.id, category: r.category, status: r.status, district: r.district, observed_at: r.observed_at, provenance: r.provenance }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })) });
    default:
      return Response.json({ error: "Bilinmeyen katman" }, { status: 404 });
  }
  return Response.json({ error: "Bu katman için veri anlık görüntüsü yok. `node scripts/ingest.mjs` çalıştırın." }, { status: 503 });
}
