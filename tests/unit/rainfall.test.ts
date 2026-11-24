import { describe, expect, it } from "vitest";
import { annualMaxima, hourlyToDaily, mmOverAreaToM3, rollingMaxSum, summarizeHourly } from "@/lib/domain/rainfall";

describe("rainfall aggregation", () => {
  it("summarizes hourly series and counts missing values", () => {
    const s = summarizeHourly([0, 2, 5, null, 1, 4, 4]);
    expect(s.total_mm).toBe(16);
    expect(s.max_hourly_mm).toBe(5);
    expect(s.max_3h_mm).toBe(9); // [1,4,4]; windows containing null are skipped
    expect(s.missing).toBe(1);
  });
  it("rolling max is null when the series is shorter than the window", () => {
    expect(rollingMaxSum([1, 2], 3)).toBeNull();
  });
  it("aggregates hourly to daily by local date", () => {
    expect(hourlyToDaily(["2023-09-05T23:00", "2023-09-06T00:00", "2023-09-06T01:00"], [1, 2, null])).toEqual([
      { date: "2023-09-05", mm: 1 }, { date: "2023-09-06", mm: 2 },
    ]);
  });
  it("computes annual maxima and flags incomplete years", () => {
    const time = ["2020-01-01", "2020-01-02", "2021-01-01", "2021-01-02"];
    const r = annualMaxima(time, [3, 7, null, null]);
    expect(r[0]).toMatchObject({ year: 2020, max_mm: 7, date: "2020-01-02", complete: true });
    expect(r[1].complete).toBe(false);
  });
  it("converts mm over an area to m³ (1 mm on 1000 m² = 1 m³)", () => {
    expect(mmOverAreaToM3(1, 1000)).toBe(1);
    expect(mmOverAreaToM3(50, 50_000)).toBe(2500);
  });
});
