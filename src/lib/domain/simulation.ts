/**
 * Lumped storage water-balance simulator (educational / pre-feasibility only).
 * Storage(t+Δt) = max(0, Storage(t) + Inflow(t)·Δt − Outflow(t)·Δt)
 * Inflow uses the rational-method volume form: Q = C · i · A  (i in m/h → m³/h).
 * Ignores backwater, pipe network hydraulics, underground connections and 2D surface flow.
 */
export interface SimInput {
  areaM2: number; // contributing surface area
  runoffC: number; // 0..1
  rainMmPerH: number[]; // hyetograph, one value per rainStepMin
  rainStepMin: number;
  initialStorageM3: number;
  storageCapacityM3: number; // volume that can accumulate before surface flooding/overflow
  pumpCount: number;
  pumpFlowM3h: number; // per pump, at the assumed operating point
  dischargeLimitM3h: number | null; // downstream receiving capacity; null = unconstrained
  durationH: number;
  dtMin: number;
  headM?: number | null; // optional: for energy estimate
  efficiency?: number | null; // wire-to-water efficiency 0..1
}

export interface SimPoint { tH: number; storageM3: number; inflowM3h: number; outflowM3h: number; excessM3: number }
export interface SimResult {
  series: SimPoint[];
  peakStorageM3: number;
  peakTimeH: number;
  peakExcessM3: number; // max volume above available storage
  drainTimeH: number | null; // time after rain stops until storage ≈ 0; null = not within duration
  totalInflowM3: number;
  totalPumpedM3: number;
  unmetDischargeM3: number; // pump-able water blocked by discharge limit
  energyKWh: number | null;
}

export function validateSim(i: SimInput): string[] {
  const e: string[] = [];
  if (!(i.areaM2 > 0)) e.push("Katkı alanı pozitif olmalı.");
  if (!(i.runoffC >= 0 && i.runoffC <= 1)) e.push("Akış katsayısı 0–1 aralığında olmalı.");
  if (!(i.dtMin > 0 && i.dtMin <= 60)) e.push("Zaman adımı 0–60 dk aralığında olmalı.");
  if (!(i.durationH > 0 && i.durationH <= 168)) e.push("Süre 0–168 saat aralığında olmalı.");
  if (i.pumpCount < 0 || i.pumpFlowM3h < 0) e.push("Pompa değerleri negatif olamaz.");
  if (i.rainMmPerH.some((r) => r < 0)) e.push("Yağış yoğunluğu negatif olamaz.");
  if (i.initialStorageM3 < 0 || i.storageCapacityM3 < 0) e.push("Hacimler negatif olamaz.");
  return e;
}

export function simulate(i: SimInput): SimResult {
  const errs = validateSim(i);
  if (errs.length) throw new Error(errs.join(" "));
  const dtH = i.dtMin / 60;
  const steps = Math.round(i.durationH / dtH);
  const pumpCap = i.pumpCount * i.pumpFlowM3h;
  const outCap = i.dischargeLimitM3h == null ? pumpCap : Math.min(pumpCap, i.dischargeLimitM3h);
  const rainEndH = (i.rainMmPerH.length * i.rainStepMin) / 60;

  let s = i.initialStorageM3;
  let totalIn = 0, totalOut = 0, unmet = 0, peak = s, peakT = 0, peakExcess = Math.max(0, s - i.storageCapacityM3);
  let drainTimeH: number | null = null;
  const series: SimPoint[] = [{ tH: 0, storageM3: s, inflowM3h: 0, outflowM3h: 0, excessM3: peakExcess }];

  for (let k = 0; k < steps; k++) {
    const t = k * dtH;
    const rainIdx = Math.floor((t * 60) / i.rainStepMin);
    const rain = rainIdx < i.rainMmPerH.length ? i.rainMmPerH[rainIdx] : 0;
    const qin = i.runoffC * (rain / 1000) * i.areaM2; // m³/h
    const available = s / dtH + qin; // max rate that can leave without going negative
    const pumpable = Math.min(available, pumpCap);
    const qout = Math.min(available, outCap);
    unmet += (pumpable - qout) * dtH;
    s = Math.max(0, s + (qin - qout) * dtH);
    totalIn += qin * dtH;
    totalOut += qout * dtH;
    const tNext = (k + 1) * dtH;
    const excess = Math.max(0, s - i.storageCapacityM3);
    if (s > peak) { peak = s; peakT = tNext; }
    peakExcess = Math.max(peakExcess, excess);
    if (drainTimeH == null && tNext >= rainEndH && s < 1e-6 && peak > 0) drainTimeH = Math.max(0, tNext - rainEndH);
    series.push({ tH: round(tNext, 3), storageM3: round(s), inflowM3h: round(qin), outflowM3h: round(qout), excessM3: round(excess) });
  }

  if (peak === 0) drainTimeH = 0; // nothing ever accumulated
  let energyKWh: number | null = null;
  if (i.headM && i.efficiency && i.efficiency > 0) {
    // E = ρ g V H / η  [J] → kWh
    energyKWh = round((1000 * 9.81 * totalOut * i.headM) / i.efficiency / 3.6e6, 1);
  }
  return {
    series,
    peakStorageM3: round(peak),
    peakTimeH: round(peakT, 2),
    peakExcessM3: round(peakExcess),
    drainTimeH: drainTimeH == null ? null : round(drainTimeH, 2),
    totalInflowM3: round(totalIn),
    totalPumpedM3: round(totalOut),
    unmetDischargeM3: round(unmet),
    energyKWh,
  };
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
