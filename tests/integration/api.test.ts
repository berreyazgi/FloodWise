import { beforeEach, describe, expect, it, vi } from "vitest";

// connection() only opts out of prerendering and needs a Next request scope; no-op outside Next.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
import { NextRequest } from "next/server";
import { resetDbForTests } from "@/lib/server/db";
import { resetRateLimits } from "@/lib/server/auth";
import { snapshots } from "@/lib/server/snapshots";
import * as meta from "@/app/api/meta/route";
import * as reports from "@/app/api/reports/route";
import * as reportStatus from "@/app/api/reports/[id]/route";
import * as scenarios from "@/app/api/scenarios/route";
import * as riskRun from "@/app/api/risk/run/route";
import * as genReports from "@/app/api/generated-reports/route";
import * as genReport from "@/app/api/generated-reports/[id]/route";
import * as events from "@/app/api/events/route";
import * as geo from "@/app/api/geo/[layer]/route";

const OP = { cookie: "fw_role=operator" };
const req = (url: string, init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {}) => new NextRequest(`http://test${url}`, init);
const jsonReq = (url: string, body: unknown, headers: Record<string, string> = {}, method = "POST") =>
  req(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) }) as never;

const report = { district: "Küçükçekmece", neighborhood: "", lon: 28.7851, lat: 41.0301, category: "street", observed_at: "2026-10-12T21:40", description: "Kavşakta yaklaşık 20 cm su birikti, ızgaralar tıkalı.", water_depth_cm: 20, building_affected: false, road_affected: true, display_name: "", consent: true };
const reportForm = (data: unknown, photo?: Blob) => { const fd = new FormData(); fd.set("data", JSON.stringify(data)); if (photo) fd.set("photo", photo, "x.jpg"); return req("/api/reports", { method: "POST", body: fd }); };

beforeEach(() => { resetDbForTests(); resetRateLimits(); });

describe("data ingestion snapshots", () => {
  it("contain both pilot districts, an elevation grid with a water mask, waterways and ERA5 series", () => {
    expect(snapshots.districts()!.districts.map((d) => d.id).sort()).toEqual(["basaksehir", "kucukcekmece"]);
    const g = snapshots.elevation()!;
    expect(g.resolution_m).toBe(90);
    expect(g.grids.every((x) => x.cells.length > 100 && x.cells.every((c) => typeof c.elev === "number"))).toBe(true);
    expect(g.grids.some((x) => x.cells.some((c) => c.water))).toBe(true);
    expect(snapshots.waterways()!.features.some((f) => /ayamama/i.test(f.properties.name ?? ""))).toBe(true);
    expect(snapshots.rainfall()!.series.filter((s) => s.kind === "hourly")).toHaveLength(4);
  });
});

describe("API", () => {
  it("meta counts come from records (seeded demo data is labelled)", async () => {
    const m = await (await meta.GET()).json();
    expect(m).toMatchObject({ historicalEvents: 2, verifiedEvents: 2, citizenReports: 3, demoReports: 3 });
    expect(m.investigationCandidates).toBeGreaterThan(0);
  });

  it("filters events by date", async () => {
    const r = await (await events.GET(req("/api/events?from=2020-01-01"))).json();
    expect(r.map((e: { id: string }) => e.id)).toEqual(["EVT-2023-09-05"]);
  });

  it("creates a pending citizen report, strips nothing it should keep, and hides it from the public until verified", async () => {
    const res = await reports.POST(reportForm(report));
    expect(res.status).toBe(201);
    const { id, ai } = await res.json();
    expect(ai.suggestedCategory).toBe("drain");
    expect(ai.possibleDuplicates.map((d: { id: string }) => d.id)).toContain("DEMO-R1");

    const publicList = await (await reports.GET(req("/api/reports"))).json();
    expect(publicList.find((r: { id: string }) => r.id === id)).toBeUndefined();

    expect((await reportStatus.PATCH(jsonReq(`/api/reports/${id}`, { status: "verified" }, {}, "PATCH"), params({ id }))).status).toBe(403);
    expect((await reportStatus.PATCH(jsonReq(`/api/reports/${id}`, { status: "verified", notes: "Saha teyidi" }, OP, "PATCH"), params({ id }))).status).toBe(200);

    const after = await (await reports.GET(req("/api/reports"))).json();
    const pub = after.find((r: { id: string }) => r.id === id);
    expect(pub.status).toBe("verified");
    expect(pub.lon).toBe(28.785); // coarsened to 3 decimals for the public
    expect(pub.verification_notes).toBeNull();
  });

  it("rejects invalid reports and non-image uploads", async () => {
    expect((await reports.POST(reportForm({ ...report, description: "kısa" }))).status).toBe(400);
    const res = await reports.POST(reportForm(report, new Blob(["#!/bin/sh\nrm -rf /"], { type: "image/jpeg" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("JPEG veya PNG");
  });

  it("rate-limits report submissions", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await reports.POST(reportForm(report))).status);
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it("saves scenarios with server-recomputed results, ignoring client-sent results", async () => {
    const input = { areaM2: 10_000, runoffC: 1, rainMmPerH: [60], rainStepMin: 60, initialStorageM3: 0, storageCapacityM3: 300, pumpCount: 0, pumpFlowM3h: 0, dischargeLimitM3h: null, durationH: 6, dtMin: 5 };
    expect((await scenarios.POST(jsonReq("/api/scenarios", { kind: "simulation", locationId: "loc-ayamama", name: "Test", input }))).status).toBe(403);
    const res = await scenarios.POST(jsonReq("/api/scenarios", { kind: "simulation", locationId: "loc-ayamama", name: "Test", input, results: { peakStorageM3: 1 } }, OP));
    expect(res.status).toBe(201);
    const list = await (await scenarios.GET(req("/api/scenarios?locationId=loc-ayamama"))).json();
    const saved = list.find((s: { scenario_name: string }) => s.scenario_name === "Test");
    expect(saved.results.peakStorageM3).toBeCloseTo(600, 0);
    expect(saved.provenance).toBe("estimated");
  });

  it("risk analysis is reproducible", async () => {
    const a = await (await riskRun.POST(jsonReq("/api/risk/run", { locationId: "loc-kucukcekmece" }, OP))).json();
    const b = await (await riskRun.POST(jsonReq("/api/risk/run", { locationId: "loc-kucukcekmece" }, OP))).json();
    expect(a.id).not.toBe(b.id);
    expect(a.risk_index).toBe(b.risk_index);
    expect(a.explanation.candidates.map((c: { id: string }) => c.id)).toEqual(b.explanation.candidates.map((c: { id: string }) => c.id));
    expect(a.explanation.pipeline.find((p: { step: string }) => p.step.includes("Makine")).status).toBe("skipped");
  });

  it("generates a report with all required sections, kinds and references", async () => {
    const { id } = await (await genReports.POST(jsonReq("/api/generated-reports", { locationId: "loc-ayamama" }, OP))).json();
    const r = await (await genReport.GET(req(`/api/generated-reports/${id}`, { headers: OP }), params({ id }))).json();
    const titles = r.content.sections.map((s: { title: string }) => s.title).join(" | ");
    for (const t of ["Çalışma alanı", "Veri kaynakları", "Geçmiş olaylar", "Coğrafi değerlendirme", "Model açıklaması", "Belirsizlikler", "senaryo", "Wilo", "mühendislik kontrolleri", "sonraki adımlar"])
      expect(titles.toLocaleLowerCase("tr-TR")).toContain(t.toLocaleLowerCase("tr-TR"));
    expect(new Set(r.content.sections.map((s: { kind: string }) => s.kind))).toEqual(new Set(["verified", "guidance", "model", "illustrative"]));
    expect(r.content.references.length).toBeGreaterThan(5);
    expect((await genReport.GET(req(`/api/generated-reports/${id}`), params({ id }))).status).toBe(403);
  });

  it("serves map layers and never turns district events into points", async () => {
    const ev = await (await geo.GET(req("/api/geo/events"), params({ layer: "events" }))).json();
    expect(ev.features.every((f: { geometry: { type: string } }) => f.geometry.type !== "Point")).toBe(true);
    const grid = await (await geo.GET(req("/api/geo/screening"), params({ layer: "screening" }))).json();
    expect(grid.meta.resolution_m).toBe(90);
  });
});
