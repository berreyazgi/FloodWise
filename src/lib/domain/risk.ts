/**
 * Exploratory flood-exposure SCREENING index (not a validated flood probability).
 *
 * Why not ML: the app holds 2 verified events, both at district / corridor precision. There are no
 * cell-level positive/negative labels, so any trained classifier would be fitting noise and any
 * accuracy metric would be fabricated. The index below is transparent, deterministic and reproducible.
 */
import { distanceToLinesM, gridSpacingM, type LonLat } from "./geo";

export interface GridCell { lon: number; lat: number; elev: number | null; inside: boolean; water?: boolean }
export type FactorKey = "depression" | "flatness" | "waterProximity" | "lowland";
export type Weights = Record<FactorKey, number>;

export const MODEL_VERSION = "screening-index-v1";
export const DEFAULT_WEIGHTS: Weights = { depression: 0.3, flatness: 0.15, waterProximity: 0.35, lowland: 0.2 };

export const FACTOR_META: Record<FactorKey, { label: string; rule: string }> = {
  depression: { label: "Yerel çukurluk (TPI)", rule: "Hücre kotu komşu 8 hücre ortalamasından 5 m veya daha alçaksa 1, eşit/yüksekse 0." },
  flatness: { label: "Düşük eğim", rule: "Eğim 0° ise 1, 6° ve üzeri ise 0 (doğrusal)." },
  waterProximity: { label: "Dere yakınlığı (OSM)", rule: "OSM dere/kanal hattına 0 m ise 1, 800 m ve üzeri ise 0 (doğrusal)." },
  lowland: { label: "Bölge içi göreli alçaklık", rule: "İlçe içindeki en düşük kot 1, en yüksek kot 0." },
};

/** Inputs we know matter but do not have at usable resolution — reported, never silently imputed. */
export const MISSING_INPUTS = [
  "Yağmursuyu / kanalizasyon şebekesi ve kapasitesi (İSKİ verisi açık değil)",
  "Geçirimsiz yüzey oranı / arazi örtüsü",
  "Bina yoğunluğu ve bodrum katı varlığı",
  "Hücre ölçeğinde doğrulanmış geçmiş taşkın konumları",
  "Yüksek çözünürlüklü (≤1–5 m) yükseklik modeli",
];

export interface CellResult {
  id: string;
  lon: number;
  lat: number;
  elev: number;
  tpiM: number;
  slopeDeg: number;
  waterDistM: number;
  factors: Record<FactorKey, number>;
  index: number; // 0..100
  stability: number; // share of perturbed-weight runs in which the cell stays in the top decile
  band: "high" | "medium" | "low";
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function bandOf(index: number): CellResult["band"] {
  return index >= 60 ? "high" : index >= 40 ? "medium" : "low";
}

export function scoreCell(f: Record<FactorKey, number>, w: Weights): number {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return (100 * (Object.keys(w) as FactorKey[]).reduce((acc, k) => acc + w[k] * f[k], 0)) / sum;
}

/** Deterministic PRNG so sensitivity analysis is reproducible. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeScreening(
  cells: GridCell[],
  stepDeg: number,
  waterways: LonLat[][],
  weights: Weights = DEFAULT_WEIGHTS,
  runs = 200,
  seed = 42,
): CellResult[] {
  // index cells by integer grid position
  const key = (lon: number, lat: number) => `${Math.round(lon / stepDeg)}:${Math.round(lat / stepDeg)}`;
  const byKey = new Map(cells.map((c) => [key(c.lon, c.lat), c]));
  const elevAt = (lon: number, lat: number) => byKey.get(key(lon, lat))?.elev ?? null;

  // open-water cells (lakes/reservoirs) are excluded from ranking but still act as neighbours
  const inside = cells.filter((c): c is GridCell & { elev: number } => c.inside && !c.water && c.elev != null);
  if (!inside.length) return [];
  const minE = Math.min(...inside.map((c) => c.elev));
  const maxE = Math.max(...inside.map((c) => c.elev));

  const raw = inside.map((c) => {
    const nb: number[] = [];
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      if (!dx && !dy) continue;
      const e = elevAt(c.lon + dx * stepDeg, c.lat + dy * stepDeg);
      if (e != null) nb.push(e);
    }
    const tpi = nb.length ? c.elev - nb.reduce((a, b) => a + b, 0) / nb.length : 0;
    // central-difference slope; falls back to the cell itself at edges
    const { dx, dy } = gridSpacingM(stepDeg, c.lat);
    const e = (ox: number, oy: number) => elevAt(c.lon + ox * stepDeg, c.lat + oy * stepDeg) ?? c.elev;
    const gx = (e(1, 0) - e(-1, 0)) / (2 * dx);
    const gy = (e(0, 1) - e(0, -1)) / (2 * dy);
    const slope = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    const dist = waterways.length ? distanceToLinesM([c.lon, c.lat], waterways) : Infinity;
    const factors: Record<FactorKey, number> = {
      depression: clamp01(-tpi / 5),
      flatness: 1 - clamp01(slope / 6),
      waterProximity: Number.isFinite(dist) ? 1 - clamp01(dist / 800) : 0,
      lowland: maxE > minE ? 1 - (c.elev - minE) / (maxE - minE) : 0,
    };
    return { c, tpi, slope, dist, factors };
  });

  // Sensitivity: perturb each weight by ×U(0.5, 1.5) and count top-decile membership.
  const rand = mulberry32(seed);
  const topN = Math.max(1, Math.round(raw.length * 0.1));
  const hits = new Array(raw.length).fill(0);
  for (let r = 0; r < runs; r++) {
    const w = Object.fromEntries((Object.keys(weights) as FactorKey[]).map((k) => [k, weights[k] * (0.5 + rand())])) as Weights;
    const scores = raw.map((x, i) => [scoreCell(x.factors, w), i] as const).sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < topN; k++) hits[scores[k][1]]++;
  }

  return raw.map((x, i) => {
    const index = Math.round(scoreCell(x.factors, weights) * 10) / 10;
    return {
      id: `${x.c.lon.toFixed(4)},${x.c.lat.toFixed(4)}`,
      lon: x.c.lon,
      lat: x.c.lat,
      elev: x.c.elev,
      tpiM: Math.round(x.tpi * 10) / 10,
      slopeDeg: Math.round(x.slope * 100) / 100,
      waterDistM: Number.isFinite(x.dist) ? Math.round(x.dist) : -1,
      factors: Object.fromEntries(Object.entries(x.factors).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) as Record<FactorKey, number>,
      index,
      stability: Math.round((hits[i] / runs) * 100) / 100,
      band: bandOf(index),
    };
  });
}

export function stabilityLabel(s: number) {
  return s >= 0.8 ? "Kararlı" : s >= 0.4 ? "Orta" : "Kararsız";
}

/** Turkish natural-language explanation built only from computed numbers. */
export function explainCell(c: CellResult, w: Weights = DEFAULT_WEIGHTS): string {
  const contrib = (Object.keys(w) as FactorKey[])
    .map((k) => ({ k, v: w[k] * c.factors[k] }))
    .sort((a, b) => b.v - a.v);
  const top = contrib.filter((x) => x.v > 0.02).slice(0, 2).map((x) => FACTOR_META[x.k].label.toLowerCase());
  const parts = [
    `Tarama indeksi ${c.index}/100.`,
    top.length ? `En büyük katkı: ${top.join(" ve ")}.` : "Belirgin bir katkı faktörü yok.",
    `Kot ${c.elev} m, komşulara göre ${c.tpiM > 0 ? "+" : ""}${c.tpiM} m, eğim ${c.slopeDeg}°` +
      (c.waterDistM >= 0 ? `, en yakın OSM dere hattı ~${c.waterDistM} m.` : "."),
    `Ağırlık duyarlılığında ilk %10'da kalma oranı %${Math.round(c.stability * 100)} (${stabilityLabel(c.stability).toLowerCase()}).`,
    "Bu bir taşkın olasılığı değildir; saha incelemesi önceliği için bir göstergedir.",
  ];
  return parts.join(" ");
}
