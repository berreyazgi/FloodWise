import { describe, expect, it } from "vitest";
import { frictionFactor, totalDynamicHead, systemCurve } from "@/lib/domain/hydraulics";
import { evaluatePlan, type PlanInput } from "@/lib/domain/pumps";
import { WILO_PRODUCTS } from "@/data/seed";

describe("hydraulics", () => {
  it("laminar friction factor = 64/Re", () => expect(frictionFactor(1000, 0)).toBeCloseTo(0.064, 5));
  it("Swamee–Jain matches Moody chart for smooth pipe at Re=1e5 (~0.018)", () => expect(frictionFactor(1e5, 0)).toBeCloseTo(0.018, 3));
  it("TDH = static head at zero flow and grows with flow", () => {
    const p = { staticHeadM: 4, pipeLengthM: 100, pipeDiameterMm: 100, roughnessMm: 0.05, minorLossK: 5 };
    const c = systemCurve(p, 60, 4);
    expect(c[0].h).toBe(4);
    expect(c.every((pt, i) => i === 0 || pt.h > c[i - 1].h)).toBe(true);
    expect(totalDynamicHead({ ...p, flowM3h: 60 }).velocityMs).toBeCloseTo(2.12, 1);
  });
});

const plan: PlanInput = { volumeM3: 100, targetHours: 10, pumpCount: 1, staticHeadM: 3, pipeLengthM: 20, pipeDiameterMm: 50, roughnessMm: 0.0015, minorLossK: 2, waterType: "slightly_dirty", intervention: "temporary", hasPower: true, hasBackupPower: true, downstreamCapacityKnown: true, hasDebris: false };

describe("pump candidate screening", () => {
  it("never labels a product as definitively suitable and always returns the missing-data message", () => {
    const r = evaluatePlan(plan, WILO_PRODUCTS);
    expect(r.candidates.every((c) => ["investigate", "data_missing", "not_recommended"].includes(c.status))).toBe(true);
    expect(r.message).toBe("Kesin pompa seçimi için ilave hidrolik ve saha verileri gereklidir.");
  });
  it("products without verified Q/H are data_missing, not investigate", () => {
    const r = evaluatePlan(plan, WILO_PRODUCTS);
    expect(r.candidates.find((c) => c.product.id === "emu-ks")!.status).toBe("data_missing");
  });
  it("blocks when TDH exceeds Hmax even if flow fits", () => {
    const r = evaluatePlan({ ...plan, staticHeadM: 12 }, WILO_PRODUCTS);
    expect(r.candidates.find((c) => c.product.id === "drain-tmw-32-11")!.status).toBe("not_recommended");
  });
  it("blocks on incompatible water type", () => {
    const r = evaluatePlan({ ...plan, waterType: "sewage" }, WILO_PRODUCTS);
    expect(r.candidates.find((c) => c.product.id === "drain-tmw-32-8")!.status).toBe("not_recommended");
    expect(r.candidates.find((c) => c.product.id === "rexa-pro")!.status).not.toBe("not_recommended");
  });
  it("TMW 32/11 passes the Qmax/Hmax pre-check for a small low-head job", () => {
    const r = evaluatePlan(plan, WILO_PRODUCTS);
    const c = r.candidates.find((x) => x.product.id === "drain-tmw-32-11")!;
    expect(c.status).toBe("investigate");
    expect(c.optimisticDrainHours).toBeCloseTo(100 / 16, 1);
  });
});
