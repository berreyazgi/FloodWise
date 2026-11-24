import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { HISTORICAL_EVENTS, WILO_PRODUCTS } from "@/data/seed";
import { bboxOf, bboxPolygon, type LonLat } from "@/lib/domain/geo";
import { simulate, type SimInput } from "@/lib/domain/simulation";
import { snapshots } from "./snapshots";
import { runAnalysis } from "./risk-service";
import { rainPresets } from "./rain-presets";
import { nowIso } from "./util";

export function seedIfEmpty(db: DatabaseSync) {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM locations").get() as { n: number }).n;
  if (n > 0) return;
  const t = nowIso();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run("demo-operator", "operator", "Demo Operatör (İBB değil)", null, t);
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?)").run("demo-citizen", "citizen", "Demo Vatandaş", null, t);

    const insLoc = db.prepare("INSERT INTO locations (id,name,district,neighborhood,geometry,geographic_precision,provenance,kind,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
    const districts = snapshots.districts()?.districts ?? [];
    for (const d of districts)
      insLoc.run(`loc-${d.id}`, `${d.name} (ilçe)`, d.name, null, JSON.stringify(d.geometry), "district", "verified", "pilot_district", "Sınır: OpenStreetMap (ODbL). Pilot araştırma bölgesi; otomatik olarak yüksek riskli kabul edilmez.", t);

    // Ayamama corridor: bbox of OSM "Ayamama" lines, padded ~500 m — an approximate study area, not an observed flood extent
    const aya = (snapshots.waterways()?.features ?? []).filter((f) => /ayamama/i.test(f.properties.name ?? ""));
    if (aya.length) {
      const [w, s, e, nn] = bboxOf(aya.flatMap((f) => f.geometry.coordinates as LonLat[]));
      const pad = 0.005;
      insLoc.run("loc-ayamama", "İkitelli – Basın Ekspres / Ayamama Deresi koridoru", "Başakşehir / Küçükçekmece", null,
        JSON.stringify(bboxPolygon([w - pad, s - pad, e + pad, nn + pad])), "corridor_approx", "estimated", "study_area",
        "OSM Ayamama Deresi geometrisinin çevresi (+~500 m). 2009 olayıyla ilişkili yaklaşık çalışma alanı.", t);
    }

    const insEvt = db.prepare("INSERT INTO historical_events (id,location_id,event_date,description,severity_observed,source_url,verified_status,geometry,data_quality,data) VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const e of HISTORICAL_EVENTS) {
      const locId = e.geographic_precision === "corridor_approx" && aya.length ? "loc-ayamama" : `loc-${e.district_ids[0]}`;
      insEvt.run(e.id, locId, e.event_date, e.description, e.consequences, e.sources[0].url, e.verified_status, null, e.data_quality, JSON.stringify(e));
    }

    const insRain = db.prepare("INSERT INTO rainfall_observations (location_id, observed_at, rainfall_mm, source, observation_type) VALUES (?,?,?,?,?)");
    for (const s of snapshots.rainfall()?.series ?? [])
      s.time.forEach((tm, i) => insRain.run(`loc-${s.district_id}`, tm, s.precipitation_mm[i], "Open-Meteo ERA5 reanalysis", `reanalysis_${s.kind}`));

    const insProd = db.prepare("INSERT INTO wilo_products VALUES (?,?,?,?,?,?,?)");
    for (const p of WILO_PRODUCTS) insProd.run(p.id, p.model_name, p.category, JSON.stringify(p), p.application, p.documentation_url, p.verification_status);

    // Demo citizen reports — clearly synthetic, never used as training labels
    const insRep = db.prepare("INSERT INTO citizen_reports (id,location_id,district,neighborhood,lon,lat,reported_at,observed_at,category,description,photo_path,water_depth_cm,building_affected,road_affected,status,verification_notes,provenance,ai_suggestions,display_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    insRep.run("DEMO-R1", "loc-kucukcekmece", "Küçükçekmece", null, 28.785, 41.03, t, "2026-10-12T21:30", "street", "[DEMO] Yoğun yağış sonrası kavşakta su birikti, araçlar geçmekte zorlandı.", null, 25, 0, 1, "pending", null, "synthetic_demo", null, "Demo");
    insRep.run("DEMO-R2", "loc-basaksehir", "Başakşehir", null, 28.79, 41.095, t, "2026-10-12T22:10", "basement", "[DEMO] Apartman bodrumuna ve otoparka su girdi, rögar taştı.", null, 40, 1, 0, "under_review", "Demo inceleme notu.", "synthetic_demo", null, "Demo");
    insRep.run("DEMO-R3", "loc-kucukcekmece", "Küçükçekmece", null, 28.7855, 41.0302, t, "2026-10-12T21:50", "street", "[DEMO] Kavşakta su birikti; ızgaralar tıkalı görünüyor.", null, null, 0, 1, "pending", null, "synthetic_demo", null, "Demo");

    for (const id of ["loc-ayamama", ...districts.map((d) => `loc-${d.id}`)])
      if (db.prepare("SELECT 1 FROM locations WHERE id=?").get(id)) runAnalysis(db, id);

    // Saved demo scenarios (synthetic assumptions, computed results)
    const preset = rainPresets().find((p) => p.id === "design-125-6h")!;
    const base: SimInput = { areaM2: 50_000, runoffC: 0.85, rainMmPerH: preset.mmPerH, rainStepMin: preset.stepMin, initialStorageM3: 0, storageCapacityM3: 1500, pumpCount: 0, pumpFlowM3h: 0, dischargeLimitM3h: null, durationH: 24, dtMin: 5, headM: 6, efficiency: 0.5 };
    const insSc = db.prepare("INSERT INTO intervention_scenarios (id,location_id,scenario_name,kind,assumptions,product_id,results,provenance,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
    const scen: [string, string, Partial<SimInput>][] = [
      ["DEMO-S-A", "A: Ek pompa yok", {}],
      ["DEMO-S-B", "B: 4 × 150 m³/h geçici pompa", { pumpCount: 4, pumpFlowM3h: 150, dischargeLimitM3h: 500 }],
      ["DEMO-S-C", "C: 2 × 150 m³/h + 1500 m³ ek depolama", { pumpCount: 2, pumpFlowM3h: 150, storageCapacityM3: 3000, dischargeLimitM3h: 500 }],
    ];
    if (db.prepare("SELECT 1 FROM locations WHERE id='loc-ayamama'").get())
      for (const [id, name, over] of scen) {
        const input = { ...base, ...over, presetId: preset.id };
        const { series: _s, ...summary } = simulate({ ...base, ...over });
        insSc.run(id, "loc-ayamama", name, "simulation", JSON.stringify(input), null, JSON.stringify(summary), "synthetic_demo", t);
      }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
