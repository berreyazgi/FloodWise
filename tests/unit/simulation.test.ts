import { describe, expect, it } from "vitest";
import { simulate, validateSim, type SimInput } from "@/lib/domain/simulation";

const base: SimInput = { areaM2: 10_000, runoffC: 1, rainMmPerH: [60], rainStepMin: 60, initialStorageM3: 0, storageCapacityM3: 300, pumpCount: 0, pumpFlowM3h: 0, dischargeLimitM3h: null, durationH: 6, dtMin: 5 };

describe("water balance simulator", () => {
  it("with no pumps, storage equals total runoff volume (C·i·A)", () => {
    const r = simulate(base);
    expect(r.totalInflowM3).toBeCloseTo(600, 0); // 60 mm × 10 000 m²
    expect(r.peakStorageM3).toBeCloseTo(600, 0);
    expect(r.peakExcessM3).toBeCloseTo(300, 0);
    expect(r.drainTimeH).toBeNull();
  });
  it("conserves mass: inflow = pumped + final storage", () => {
    const r = simulate({ ...base, pumpCount: 1, pumpFlowM3h: 100 });
    const last = r.series.at(-1)!;
    expect(r.totalInflowM3).toBeCloseTo(r.totalPumpedM3 + last.storageM3, 0);
  });
  it("never produces negative storage and outflow never exceeds pump capacity", () => {
    const r = simulate({ ...base, pumpCount: 2, pumpFlowM3h: 1000 });
    for (const p of r.series) { expect(p.storageM3).toBeGreaterThanOrEqual(0); expect(p.outflowM3h).toBeLessThanOrEqual(2000); }
    expect(r.drainTimeH).toBe(0); // pumps keep up → nothing accumulates
  });
  it("discharge limit caps outflow and is reported as unmet discharge", () => {
    const r = simulate({ ...base, pumpCount: 2, pumpFlowM3h: 300, dischargeLimitM3h: 100 });
    expect(Math.max(...r.series.map((p) => p.outflowM3h))).toBeLessThanOrEqual(100);
    expect(r.unmetDischargeM3).toBeGreaterThan(0);
  });
  it("computes drain time after rain ends", () => {
    const r = simulate({ ...base, pumpCount: 1, pumpFlowM3h: 200 });
    // 600 m³ in during hour 1, 200 m³ out → 400 m³ left at t=1 h → 2 h more
    expect(r.drainTimeH).toBeCloseTo(2, 1);
  });
  it("energy only when head and efficiency are given: E = ρgVH/η", () => {
    expect(simulate({ ...base, pumpCount: 1, pumpFlowM3h: 200 }).energyKWh).toBeNull();
    const r = simulate({ ...base, pumpCount: 1, pumpFlowM3h: 200, headM: 10, efficiency: 0.5 });
    expect(r.energyKWh).toBeCloseTo((1000 * 9.81 * 600 * 10) / 0.5 / 3.6e6, 1);
  });
  it("rejects invalid input", () => {
    expect(validateSim({ ...base, runoffC: 1.5 })).toHaveLength(1);
    expect(() => simulate({ ...base, areaM2: 0 })).toThrow();
  });
});
