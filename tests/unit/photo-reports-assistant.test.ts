import { describe, expect, it } from "vitest";
import { sanitizeImage, stripJpeg, stripPng } from "@/lib/domain/photo";
import { findPossibleDuplicates, missingInfo, suggestCategory } from "@/lib/domain/reports-ai";
import { answer, detectIntent } from "@/lib/domain/assistant";
import { CitizenReportSchema } from "@/lib/schemas";
import { HISTORICAL_EVENTS, WILO_PRODUCTS } from "@/data/seed";

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];

describe("photo sanitizing", () => {
  it("removes EXIF (APP1) from JPEG but keeps image data", () => {
    const exif = [..."Exif"].map((c) => c.charCodeAt(0)).concat([0, 0, 1, 2, 3]);
    const jpg = Uint8Array.from([0xff, 0xd8, ...seg(0xe0, [1, 2]), ...seg(0xe1, exif), ...seg(0xdb, [9, 9]), 0xff, 0xda, 0, 2, 7, 7, 0xff, 0xd9]);
    const out = stripJpeg(jpg);
    expect(Buffer.from(out).includes(Buffer.from("Exif"))).toBe(false);
    expect(out.length).toBe(jpg.length - (exif.length + 4));
    expect([...out.slice(-2)]).toEqual([0xff, 0xd9]);
  });
  it("removes tEXt chunks from PNG", () => {
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", Array(13).fill(0)), ...chunk("tEXt", [71, 80, 83]), ...chunk("IDAT", [1]), ...chunk("IEND", [])]);
    const out = stripPng(png);
    expect(Buffer.from(out).includes(Buffer.from("tEXt"))).toBe(false);
    expect(Buffer.from(out).includes(Buffer.from("IDAT"))).toBe(true);
  });
  it("rejects non-images and oversize files", () => {
    expect(() => sanitizeImage(new TextEncoder().encode("<script>alert(1)</script>"))).toThrow("JPEG veya PNG");
    expect(() => sanitizeImage(new Uint8Array(6 * 1024 * 1024))).toThrow("5 MB");
  });
});

describe("citizen report assistance", () => {
  it("suggests a category from Turkish keywords", () => {
    expect(suggestCategory("Apartmanın BODRUM katına su girdi").category).toBe("basement");
    expect(suggestCategory("Alt geçit tamamen doldu").category).toBe("underpass");
    expect(suggestCategory("hava güzel").category).toBe("other");
  });
  it("flags missing information", () => {
    expect(missingInfo({ description: "kısa", lon: null, neighborhood: null, water_depth_cm: null, observed_at: null })).toHaveLength(5);
  });
  it("detects nearby, close-in-time duplicates in the same district only", () => {
    const base = { id: "a", lon: 28.78, lat: 41.03, observed_at: "2026-10-12T21:30", district: "Küçükçekmece", description: "kavşakta su birikti" };
    const others = [
      { ...base, id: "b", lon: 28.7805, observed_at: "2026-10-12T22:00", description: "farklı metin" },
      { ...base, id: "c", lon: 28.9, description: "tamamen başka" },
      { ...base, id: "d", district: "Başakşehir" },
    ];
    expect(findPossibleDuplicates(base, others).map((d) => d.id)).toEqual(["b"]);
  });
  it("validates the form schema", () => {
    const ok = { district: "Başakşehir", neighborhood: "", lon: null, lat: null, category: "street", observed_at: "2026-10-12T21:30", description: "Cadde üzerinde 20 cm su birikti.", water_depth_cm: 20, building_affected: false, road_affected: true, display_name: "", consent: true };
    expect(CitizenReportSchema.safeParse(ok).success).toBe(true);
    expect(CitizenReportSchema.safeParse({ ...ok, description: "kısa" }).success).toBe(false);
    expect(CitizenReportSchema.safeParse({ ...ok, consent: false }).success).toBe(false);
    expect(CitizenReportSchema.safeParse({ ...ok, lon: 10, lat: 10 }).success).toBe(false);
  });
});

describe("deterministic assistant", () => {
  const ctx = { location: null, analysis: null, events: HISTORICAL_EVENTS, products: WILO_PRODUCTS, scenarios: [] };
  it("detects intents", () => {
    expect(detectIntent("Bu bölge neden inceleme önceliği taşıyor?")).toBe("why_priority");
    expect(detectIntent("Hangi veriler eksik?")).toBe("missing");
    expect(detectIntent("Hangi Wilo çözümleri değerlendirilebilir?")).toBe("wilo");
    expect(detectIntent("İki senaryo arasındaki fark nedir?")).toBe("scenario_diff");
  });
  it("cites sources for historical answers", () => {
    const a = answer("Geçmiş taşkın kayıtları neler?", ctx);
    expect(a.citations.length).toBeGreaterThan(0);
    expect(a.citations.every((c) => c.url?.startsWith("https://"))).toBe(true);
  });
  it("does not give life-safety instructions", () => {
    const a = answer("Evden çıkmalı mıyım, acil!", ctx);
    expect(a.intent).toBe("safety");
    expect(a.facts.join(" ")).toContain("112");
  });
  it("does not invent product specs (unknown Q/H stays unknown)", () => {
    const a = answer("Wilo pompa önerisi?", ctx);
    expect(a.facts.some((f) => f.includes("EMU KS") && f.includes("doğrulanmış veri yok"))).toBe(true);
  });
});
