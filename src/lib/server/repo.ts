import "server-only";
import { getDb } from "./db";
import { json, newId, nowIso } from "./util";
import { snapshotStatus, snapshots } from "./snapshots";
import { summarizeHourly, annualMaxima } from "@/lib/domain/rainfall";
import { buildReport, type AnalysisExplanation, type AnalysisUncertainty } from "@/lib/domain/report";
import type { HistoricalEvent, ReportStatus, WiloProduct } from "@/lib/domain/types";

export interface LocationRow { id: string; name: string; district: string; neighborhood: string | null; geometry: string; geographic_precision: string; provenance: string; kind: string; notes: string | null; created_at: string }

export function listLocations() {
  return (getDb().prepare("SELECT * FROM locations ORDER BY kind DESC, name").all() as unknown as LocationRow[]).map((l) => ({ ...l, geometry: json<unknown>(l.geometry) }));
}
export function getLocation(id: string) {
  const l = getDb().prepare("SELECT * FROM locations WHERE id=?").get(id) as LocationRow | undefined;
  return l ? { ...l, geometry: json<unknown>(l.geometry) } : null;
}
export function createLocation(input: { name: string; district: string; lon: number; lat: number; notes?: string | null }) {
  const id = newId("LOC");
  getDb().prepare("INSERT INTO locations (id,name,district,neighborhood,geometry,geographic_precision,provenance,kind,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, input.name, input.district, null, JSON.stringify({ type: "Point", coordinates: [input.lon, input.lat] }), "cell_500m", "estimated", "study_point", input.notes ?? null, nowIso());
  return id;
}

export function listEvents(): HistoricalEvent[] {
  return (getDb().prepare("SELECT data FROM historical_events ORDER BY event_date DESC").all() as { data: string }[]).map((r) => json<HistoricalEvent>(r.data));
}
export function getEvent(id: string) {
  const r = getDb().prepare("SELECT data, location_id FROM historical_events WHERE id=?").get(id) as { data: string; location_id: string } | undefined;
  return r ? { ...json<HistoricalEvent>(r.data), location_id: r.location_id } : null;
}

/** District ids whose name appears in a location's district label (e.g. "Başakşehir / Küçükçekmece"). */
export function districtIdsOf(districtLabel: string) {
  return (snapshots.districts()?.districts ?? []).filter((d) => districtLabel.includes(d.name)).map((d) => d.id);
}
export function eventsForLocation(districtLabel: string) {
  const ids = districtIdsOf(districtLabel);
  return listEvents().filter((e) => e.district_ids.some((d) => ids.includes(d)));
}

/** Hourly reanalysis around an event for each affected district. */
export function eventRainfall(e: HistoricalEvent) {
  const rain = snapshots.rainfall();
  if (!rain) return { available: false as const, reason: "Yağış anlık görüntüsü yok — `node scripts/ingest.mjs` çalıştırın." };
  const year = e.event_date.slice(0, 4);
  const series = rain.series
    .filter((s) => s.kind === "hourly" && s.start.startsWith(year) && e.district_ids.includes(s.district_id))
    .map((s) => ({
      district_id: s.district_id,
      grid: { lat: s.grid_lat, lon: s.grid_lon },
      summary: summarizeHourly(s.precipitation_mm),
      points: s.time.map((t, i) => ({ t, mm: s.precipitation_mm[i] })),
    }));
  return { available: true as const, source: rain.source, license: rain.license, fetched_at: rain.fetched_at, timezone: rain.timezone, series };
}

export function rainfallClimatology(districtId: string) {
  const s = snapshots.rainfall()?.series.find((x) => x.district_id === districtId && x.kind === "daily");
  if (!s) return null;
  return { source: snapshots.rainfall()!.source, grid: { lat: s.grid_lat, lon: s.grid_lon }, annualMax: annualMaxima(s.time, s.precipitation_mm) };
}

interface AnalysisRow { id: string; location_id: string; model_version: string; risk_index: number; input_snapshot: string; explanation: string; uncertainty: string; created_at: string }
const parseAnalysis = (r: AnalysisRow) => ({ ...r, input_snapshot: json<Record<string, unknown>>(r.input_snapshot), explanation: json<AnalysisExplanation>(r.explanation), uncertainty: json<AnalysisUncertainty>(r.uncertainty) });
export function latestAnalysis(locationId: string) {
  const r = getDb().prepare("SELECT * FROM risk_analyses WHERE location_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(locationId) as AnalysisRow | undefined;
  return r ? parseAnalysis(r) : null;
}
export function getAnalysis(id: string) {
  const r = getDb().prepare("SELECT * FROM risk_analyses WHERE id=?").get(id) as AnalysisRow | undefined;
  return r ? parseAnalysis(r) : null;
}
export function listAnalyses() {
  return getDb().prepare("SELECT a.id, a.location_id, l.name AS location_name, a.model_version, a.risk_index, a.created_at FROM risk_analyses a JOIN locations l ON l.id=a.location_id ORDER BY a.created_at DESC").all();
}

export function listProducts(): WiloProduct[] {
  return (getDb().prepare("SELECT specifications FROM wilo_products ORDER BY model_name").all() as { specifications: string }[]).map((r) => json<WiloProduct>(r.specifications));
}
export function getProduct(id: string) {
  const r = getDb().prepare("SELECT specifications FROM wilo_products WHERE id=?").get(id) as { specifications: string } | undefined;
  return r ? json<WiloProduct>(r.specifications) : null;
}

interface ScenarioRow { id: string; location_id: string; scenario_name: string; kind: string; assumptions: string; product_id: string | null; results: string; provenance: string; created_at: string }
export function listScenarios(locationId?: string) {
  const db = getDb();
  const rows = (locationId
    ? db.prepare("SELECT * FROM intervention_scenarios WHERE location_id=? ORDER BY created_at, id").all(locationId)
    : db.prepare("SELECT * FROM intervention_scenarios ORDER BY created_at, id").all()) as unknown as ScenarioRow[];
  return rows.map((r) => ({ ...r, assumptions: json<Record<string, unknown>>(r.assumptions), results: json<Record<string, number | null>>(r.results) }));
}
export function saveScenario(s: { location_id: string; scenario_name: string; kind: "simulation" | "pump_plan"; assumptions: unknown; product_id: string | null; results: unknown }) {
  const id = newId("SC");
  getDb().prepare("INSERT INTO intervention_scenarios (id,location_id,scenario_name,kind,assumptions,product_id,results,provenance,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id, s.location_id, s.scenario_name, s.kind, JSON.stringify(s.assumptions), s.product_id, JSON.stringify(s.results), "estimated", nowIso());
  return id;
}

export interface CitizenReportRow { id: string; location_id: string | null; district: string; neighborhood: string | null; lon: number | null; lat: number | null; reported_at: string; observed_at: string | null; category: string; description: string; photo_path: string | null; water_depth_cm: number | null; building_affected: number; road_affected: number; status: ReportStatus; verification_notes: string | null; provenance: string; ai_suggestions: string | null; display_name: string | null }
export function listReports(opts: { publicView: boolean }) {
  const rows = getDb().prepare("SELECT * FROM citizen_reports ORDER BY reported_at DESC, id DESC").all() as unknown as CitizenReportRow[];
  const parsed = rows.map((r) => ({ ...r, ai_suggestions: r.ai_suggestions ? json<unknown>(r.ai_suggestions) : null, has_photo: !!r.photo_path, photo_path: undefined }));
  if (!opts.publicView) return parsed;
  // public: only verified/resolved, coordinates coarsened to ~100 m, no names or notes
  return parsed
    .filter((r) => r.status === "verified" || r.status === "resolved")
    .map((r) => ({ ...r, lon: r.lon == null ? null : Math.round(r.lon * 1000) / 1000, lat: r.lat == null ? null : Math.round(r.lat * 1000) / 1000, display_name: null, verification_notes: null, ai_suggestions: null }));
}
export function getReportRow(id: string) {
  return getDb().prepare("SELECT * FROM citizen_reports WHERE id=?").get(id) as CitizenReportRow | undefined;
}
export function insertReport(r: Omit<CitizenReportRow, "status" | "verification_notes" | "reported_at">) {
  getDb().prepare("INSERT INTO citizen_reports (id,location_id,district,neighborhood,lon,lat,reported_at,observed_at,category,description,photo_path,water_depth_cm,building_affected,road_affected,status,verification_notes,provenance,ai_suggestions,display_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(r.id, r.location_id, r.district, r.neighborhood, r.lon, r.lat, nowIso(), r.observed_at, r.category, r.description, r.photo_path, r.water_depth_cm, r.building_affected, r.road_affected, "pending", null, r.provenance, r.ai_suggestions, r.display_name);
}
export function updateReportStatus(id: string, status: ReportStatus, notes: string | null) {
  const res = getDb().prepare("UPDATE citizen_reports SET status=?, verification_notes=COALESCE(?, verification_notes) WHERE id=?").run(status, notes, id);
  getDb().prepare("INSERT INTO audit_log (at, actor, action, target) VALUES (?,?,?,?)").run(nowIso(), "demo-operator", `status:${status}`, id);
  return res.changes > 0;
}

export function stats() {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    historicalEvents: one("SELECT COUNT(*) n FROM historical_events"),
    verifiedEvents: one("SELECT COUNT(*) n FROM historical_events WHERE verified_status='verified'"),
    citizenReports: one("SELECT COUNT(*) n FROM citizen_reports"),
    demoReports: one("SELECT COUNT(*) n FROM citizen_reports WHERE provenance='synthetic_demo'"),
    pendingReports: one("SELECT COUNT(*) n FROM citizen_reports WHERE status IN ('pending','under_review')"),
    verifiedReports: one("SELECT COUNT(*) n FROM citizen_reports WHERE status='verified'"),
    studyLocations: one("SELECT COUNT(*) n FROM locations"),
    analyses: one("SELECT COUNT(*) n FROM risk_analyses"),
    scenarios: one("SELECT COUNT(*) n FROM intervention_scenarios"),
    generatedReports: one("SELECT COUNT(*) n FROM generated_reports"),
    // candidate cells = distinct top-10 cells in latest analysis per location with index ≥ 60
    investigationCandidates: (() => {
      const ids = new Set<string>();
      for (const l of db.prepare("SELECT id FROM locations").all() as { id: string }[])
        latestAnalysis(l.id)?.explanation.candidates.filter((c) => c.index >= 60).forEach((c) => ids.add(c.id));
      return ids.size;
    })(),
    snapshots: snapshotStatus(),
  };
}

export function generateReport(locationId: string, scenarioIds: string[] | null) {
  const loc = getLocation(locationId);
  if (!loc) throw new Error("Konum bulunamadı");
  const analysis = latestAnalysis(locationId);
  const events = eventsForLocation(loc.district);
  const scen = listScenarios(locationId).filter((s) => !scenarioIds || scenarioIds.includes(s.id));
  const content = buildReport({
    location: { name: loc.name, district: loc.district, precision: loc.geographic_precision, notes: loc.notes },
    analysis,
    events,
    scenarios: scen.filter((s) => s.kind === "simulation"),
    products: listProducts().filter((p) => p.water_types.some((w) => w === "slightly_dirty" || w === "sandy")),
    dataSources: snapshotStatus(),
    generatedAt: nowIso(),
  });
  const id = newId("RPT");
  getDb().prepare("INSERT INTO generated_reports (id, analysis_id, location_id, report_type, content, created_at, file_path) VALUES (?,?,?,?,?,?,?)")
    .run(id, analysis?.id ?? null, locationId, "preliminary_assessment", JSON.stringify(content), nowIso(), null);
  return id;
}
export function listGeneratedReports() {
  return getDb().prepare("SELECT r.id, r.location_id, l.name AS location_name, r.report_type, r.created_at FROM generated_reports r JOIN locations l ON l.id=r.location_id ORDER BY r.created_at DESC").all();
}
export function getGeneratedReport(id: string) {
  const r = getDb().prepare("SELECT * FROM generated_reports WHERE id=?").get(id) as { id: string; content: string; created_at: string; location_id: string } | undefined;
  return r ? { ...r, content: json<ReturnType<typeof buildReport>>(r.content) } : null;
}
