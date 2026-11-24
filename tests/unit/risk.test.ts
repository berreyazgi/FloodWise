import { describe, expect, it } from "vitest";
import { bandOf, computeScreening, scoreCell, DEFAULT_WEIGHTS, explainCell, type GridCell } from "@/lib/domain/risk";

const STEP = 0.005;
function grid(elevAt: (i: number, j: number) => number, water?: (i: number, j: number) => boolean): GridCell[] {
  const out: GridCell[] = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++)
    out.push({ lon: 28.7 + i * STEP, lat: 41 + j * STEP, elev: elevAt(i, j), inside: true, water: water?.(i, j) ?? false });
  return out;
}

describe("screening index", () => {
  it("scores 0..100 and bands with fixed thresholds", () => {
    expect(scoreCell({ depression: 1, flatness: 1, waterProximity: 1, lowland: 1 }, DEFAULT_WEIGHTS)).toBeCloseTo(100);
    expect(scoreCell({ depression: 0, flatness: 0, waterProximity: 0, lowland: 0 }, DEFAULT_WEIGHTS)).toBe(0);
    expect([bandOf(60), bandOf(59.9), bandOf(39.9)]).toEqual(["high", "medium", "low"]);
  });
  it("ranks a local depression next to a stream highest", () => {
    const cells = grid((i, j) => (i === 3 && j === 3 ? 10 : 30 + i + j));
    const stream = [[[28.7 + 3 * STEP, 41], [28.7 + 3 * STEP, 41 + 6 * STEP]]] as [number, number][][];
    const r = computeScreening(cells, STEP, stream);
    const top = [...r].sort((a, b) => b.index - a.index)[0];
    expect(top.id).toBe(`${(28.7 + 3 * STEP).toFixed(4)},${(41 + 3 * STEP).toFixed(4)}`);
    expect(top.tpiM).toBeLessThan(0);
    expect(explainCell(top)).toContain("taşkın olasılığı değildir");
  });
  it("excludes open-water cells from ranking", () => {
    const cells = grid(() => 20, (i, j) => i === 0 && j === 0);
    expect(computeScreening(cells, STEP, []).length).toBe(48);
  });
  it("is reproducible (same seed → identical results)", () => {
    const cells = grid((i, j) => (i * 7 + j * 13) % 17);
    expect(computeScreening(cells, STEP, [], DEFAULT_WEIGHTS, 50, 7)).toEqual(computeScreening(cells, STEP, [], DEFAULT_WEIGHTS, 50, 7));
  });
});
