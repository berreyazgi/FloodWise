/** Rainfall aggregation over hourly/daily series (values in mm; nulls = missing observations). */

export interface RainSummary {
  total_mm: number;
  max_hourly_mm: number | null;
  max_3h_mm: number | null;
  missing: number;
  count: number;
}

export function rollingMaxSum(values: (number | null)[], window: number): number | null {
  if (values.length < window) return null;
  let best: number | null = null;
  for (let i = 0; i + window <= values.length; i++) {
    const slice = values.slice(i, i + window);
    if (slice.some((v) => v == null)) continue; // a window with gaps is not comparable
    const s = (slice as number[]).reduce((a, b) => a + b, 0);
    best = best == null ? s : Math.max(best, s);
  }
  return best;
}

export function summarizeHourly(values: (number | null)[]): RainSummary {
  const present = values.filter((v): v is number => v != null);
  return {
    total_mm: round(present.reduce((a, b) => a + b, 0)),
    max_hourly_mm: present.length ? round(Math.max(...present)) : null,
    max_3h_mm: nullableRound(rollingMaxSum(values, 3)),
    missing: values.length - present.length,
    count: values.length,
  };
}

/** Hourly → daily sums keyed by YYYY-MM-DD (times are local ISO strings "YYYY-MM-DDTHH:mm"). */
export function hourlyToDaily(time: string[], values: (number | null)[]) {
  const out = new Map<string, number>();
  time.forEach((t, i) => {
    const v = values[i];
    if (v == null) return;
    const day = t.slice(0, 10);
    out.set(day, round((out.get(day) ?? 0) + v));
  });
  return [...out].map(([date, mm]) => ({ date, mm }));
}

/** Annual maximum daily precipitation (mm). Years with >10% missing days are flagged incomplete. */
export function annualMaxima(time: string[], values: (number | null)[]) {
  const years = new Map<number, { max: number; missing: number; n: number; date: string }>();
  time.forEach((t, i) => {
    const y = Number(t.slice(0, 4));
    const rec = years.get(y) ?? { max: 0, missing: 0, n: 0, date: "" };
    rec.n++;
    const v = values[i];
    if (v == null) rec.missing++;
    else if (v > rec.max) Object.assign(rec, { max: v, date: t.slice(0, 10) });
    years.set(y, rec);
  });
  return [...years].map(([year, r]) => ({ year, max_mm: round(r.max), date: r.date, complete: r.missing / r.n <= 0.1 }));
}

/** Rainfall depth (mm) over an area (m²) → volume (m³). 1 mm on 1 m² = 1 litre = 0.001 m³. */
export const mmOverAreaToM3 = (mm: number, areaM2: number) => (mm / 1000) * areaM2;

const round = (v: number) => Math.round(v * 10) / 10;
const nullableRound = (v: number | null) => (v == null ? null : round(v));
