/** Simplified system-curve hydraulics for preliminary checks (clear-water assumptions). */
export interface PipeInput {
  flowM3h: number;
  staticHeadM: number; // geodetic lift: discharge level − water level
  pipeLengthM: number;
  pipeDiameterMm: number;
  roughnessMm: number; // e.g. 0.0015 PE, 0.05 steel (new)
  minorLossK: number; // sum of fitting loss coefficients
}

const G = 9.81;
const NU = 1.0e-6; // kinematic viscosity of water at ~20 °C, m²/s

/** Swamee–Jain explicit approximation of the Colebrook equation (turbulent flow). */
export function frictionFactor(re: number, relRough: number): number {
  if (re < 2300) return 64 / Math.max(re, 1);
  return 0.25 / Math.log10(relRough / 3.7 + 5.74 / re ** 0.9) ** 2;
}

export function totalDynamicHead(p: PipeInput) {
  const q = p.flowM3h / 3600;
  const d = p.pipeDiameterMm / 1000;
  const area = (Math.PI * d * d) / 4;
  const v = q / area;
  const re = (v * d) / NU;
  const f = frictionFactor(re, p.roughnessMm / 1000 / d);
  const velHead = (v * v) / (2 * G);
  const frictionM = f * (p.pipeLengthM / d) * velHead; // Darcy–Weisbach
  const minorM = p.minorLossK * velHead;
  return {
    velocityMs: round(v, 2),
    reynolds: Math.round(re),
    frictionFactor: round(f, 4),
    frictionLossM: round(frictionM, 2),
    minorLossM: round(minorM, 2),
    tdhM: round(p.staticHeadM + frictionM + minorM, 2),
  };
}

/** System curve points H(Q) for 0..qMax. */
export function systemCurve(p: Omit<PipeInput, "flowM3h">, qMaxM3h: number, n = 12) {
  return Array.from({ length: n + 1 }, (_, k) => {
    const q = (qMaxM3h * k) / n;
    return { q: round(q, 1), h: k === 0 ? p.staticHeadM : totalDynamicHead({ ...p, flowM3h: q }).tdhM };
  });
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
