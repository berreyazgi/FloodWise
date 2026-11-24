import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { computeScreening, explainCell, DEFAULT_WEIGHTS, FACTOR_META, MISSING_INPUTS, MODEL_VERSION, stabilityLabel, type CellResult, type FactorKey } from "@/lib/domain/risk";
import { pointInGeometry, cellPolygon, type LonLat, type PolyGeom } from "@/lib/domain/geo";
import { snapshots } from "./snapshots";
import { json, newId, nowIso } from "./util";

const memo = new Map<string, CellResult[]>();

/** Screening results for one district grid (deterministic; memoized per process). */
export function districtScreening(districtId: string): CellResult[] {
  if (memo.has(districtId)) return memo.get(districtId)!;
  const elev = snapshots.elevation();
  const water = snapshots.waterways();
  const grid = elev?.grids.find((g) => g.district_id === districtId);
  if (!grid || !water) return [];
  const lines = water.features.map((f) => f.geometry.coordinates);
  const res = computeScreening(grid.cells, grid.step_deg, lines);
  memo.set(districtId, res);
  return res;
}

export function allCells(): (CellResult & { district_id: string })[] {
  return (snapshots.elevation()?.grids ?? []).flatMap((g) => districtScreening(g.district_id).map((c) => ({ ...c, district_id: g.district_id })));
}

export function screeningGeoJSON() {
  const step = snapshots.elevation()?.sample_spacing_deg ?? 0.005;
  return {
    type: "FeatureCollection" as const,
    features: allCells().map((c) => ({
      type: "Feature" as const,
      properties: { id: c.id, index: c.index, band: c.band, elev: c.elev, slope: c.slopeDeg, tpi: c.tpiM, water: c.waterDistM, stability: c.stability, district_id: c.district_id, lon: c.lon, lat: c.lat,
        f_depression: c.factors.depression, f_flatness: c.factors.flatness, f_waterProximity: c.factors.waterProximity, f_lowland: c.factors.lowland },
      geometry: { type: "Polygon" as const, coordinates: cellPolygon(c.lon, c.lat, step) },
    })),
  };
}

interface LocRow { id: string; name: string; district: string; geometry: string; geographic_precision: string }

export function cellsForLocation(loc: LocRow) {
  const g = json<PolyGeom | { type: "Point"; coordinates: LonLat }>(loc.geometry);
  const cells = allCells();
  if (g.type === "Point") {
    // nearest cell (+ immediate neighbours) to a point-type study location
    const d = (c: CellResult) => Math.hypot(c.lon - g.coordinates[0], c.lat - g.coordinates[1]);
    const sorted = [...cells].sort((a, b) => d(a) - d(b));
    return sorted.filter((c) => d(c) <= d(sorted[0]) + 0.0075).slice(0, 9);
  }
  return cells.filter((c) => pointInGeometry([c.lon, c.lat], g));
}

export const PIPELINE = [
  { step: "Kaynak verileri al", status: "done", detail: "OSM ilçe sınırları, Copernicus GLO-90 kot ızgarası, OSM dere hatları, ERA5 yağış (anlık görüntüler)." },
  { step: "Doğrula ve normalize et", status: "done", detail: "Eksik kotlu hücreler dışlandı; faktörler 0–1 aralığına ölçeklendi." },
  { step: "Koordinat sistemlerini hizala", status: "done", detail: "Tüm veriler WGS84 (EPSG:4326); mesafeler yerel eşdikdörtgen projeksiyonla." },
  { step: "Zaman pencerelerini hizala", status: "done", detail: "Yağış Europe/Istanbul saat diliminde; olay pencereleri ±3 gün." },
  { step: "Coğrafi öznitelik çıkar", status: "done", detail: "TPI, eğim, dereye uzaklık, göreli kot." },
  { step: "Temel model uygula", status: "done", detail: `${MODEL_VERSION}: ağırlıklı doğrusal tarama indeksi.` },
  { step: "Makine öğrenmesi modeli", status: "skipped", detail: "UYGULANMADI: yalnızca 2 doğrulanmış olay var ve ikisi de ilçe/koridor hassasiyetinde. Hücre ölçeğinde etiket yok; eğitilen model ve doğruluk metriği yanıltıcı olurdu." },
  { step: "Duyarlılık analizi", status: "done", detail: "Ağırlıklar ×U(0,5–1,5) ile 200 kez bozuldu (tohum 42); ilk %10'da kalma oranı ölçüldü." },
  { step: "Açıklama ve belirsizlik kaydı", status: "done", detail: "Her hücre için faktör katkıları, eksik veriler ve kararlılık." },
] as const;

export function runAnalysis(db: DatabaseSync, locationId: string) {
  const loc = db.prepare("SELECT * FROM locations WHERE id = ?").get(locationId) as LocRow | undefined;
  if (!loc) throw new Error("Konum bulunamadı");
  const cells = cellsForLocation(loc);
  const elev = snapshots.elevation();
  const water = snapshots.waterways();
  if (!cells.length || !elev || !water) throw new Error("Bu konum için analiz verisi (kot ızgarası / dere hatları) bulunmuyor.");

  const top = [...cells].sort((a, b) => b.index - a.index).slice(0, 10);
  const mean = cells.reduce((a, c) => a + c.index, 0) / cells.length;
  const keys = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];
  const factorMeans = keys.map((k) => ({
    key: k,
    label: FACTOR_META[k].label,
    rule: FACTOR_META[k].rule,
    weight: DEFAULT_WEIGHTS[k],
    meanContribution: Math.round((100 * DEFAULT_WEIGHTS[k] * cells.reduce((a, c) => a + c.factors[k], 0)) / cells.length) / 100,
  }));
  const bands = { high: 0, medium: 0, low: 0 };
  cells.forEach((c) => bands[c.band]++);

  const events = (db.prepare("SELECT id, event_date, data FROM historical_events").all() as { id: string; event_date: string; data: string }[])
    .map((e) => ({ ...json<{ title: string; district_ids: string[]; geographic_precision: string }>(e.data), id: e.id, event_date: e.event_date }))
    .filter((e) => e.district_ids.some((d) => cells.some((c) => c.district_id === d)));

  const explanation = {
    method: "Şeffaf ağırlıklı tarama indeksi (ML değil)",
    pipeline: PIPELINE,
    factors: factorMeans,
    bands,
    cellCount: cells.length,
    maxIndex: top[0]?.index ?? 0,
    candidates: top.map((c) => ({ ...c, explanation: explainCell(c), stabilityLabel: stabilityLabel(c.stability) })),
    historicalEvidence: events.map((e) => ({ id: e.id, date: e.event_date, title: e.title, precision: e.geographic_precision })),
    interpretation:
      "Yüksek indeks; düşük kotlu, düz, dereye yakın ve çevresine göre çukur hücreleri öne çıkarır. Bu hücreler saha incelemesi için önceliklendirme önerisidir, taşkın olasılığı değildir.",
  };
  const stableTop = top.filter((c) => c.stability >= 0.8).length;
  const uncertainty = {
    demResolutionM: elev.resolution_m,
    sampleSpacingM: Math.round(elev.sample_spacing_deg * 110540),
    dataCompleteness: `${keys.length} / ${keys.length + MISSING_INPUTS.length} girdi mevcut`,
    completenessRatio: Math.round((keys.length / (keys.length + MISSING_INPUTS.length)) * 100) / 100,
    missingInputs: MISSING_INPUTS,
    stableTopCandidates: `${stableTop} / ${top.length}`,
    rainfallNote: "ERA5 yeniden analizi ~9–25 km çözünürlüklü ızgaradır; yerel konvektif sağanakları ciddi biçimde düşük gösterebilir ve hücreler arasında ayrım yapmaz, bu yüzden indekse dahil edilmedi.",
    buildingScale: "Bu konum için bina veya cadde ölçeğinde güvenilir tahmin üretmeye yeterli veri bulunmuyor.",
  };
  const inputSnapshot = {
    weights: DEFAULT_WEIGHTS,
    elevation: { source: elev.source, fetched_at: elev.fetched_at },
    waterways: { source: water.source, fetched_at: water.fetched_at, features: water.features.length },
    sensitivity: { runs: 200, seed: 42 },
  };
  const id = newId("RA");
  db.prepare("INSERT INTO risk_analyses (id, location_id, model_version, risk_index, input_snapshot, explanation, uncertainty, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, locationId, MODEL_VERSION, Math.round(mean * 10) / 10, JSON.stringify(inputSnapshot), JSON.stringify(explanation), JSON.stringify(uncertainty), nowIso());
  return id;
}
